import {
  query,
  type AgentDefinition,
  type CanUseTool,
  type McpServerConfig,
  type Options,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { type NiatoEvent } from "../../observability/events.js";
import { messagesToEvents } from "../../observability/event-stream.js";
import { type DomainPack } from "../../packs/DomainPack.js";
import {
  type IntentResult,
  type SecondaryIntent,
} from "../classifier/types.js";
import { BuiltinTools } from "../../tools/builtin.js";
import { type Hooks, mergeHooks } from "../../guardrails/hooks.js";
import { agentOnlyOrchestratorHook } from "../../guardrails/orchestrator-enforcement.js";
import { buildPersonaPreamble, type Persona } from "../persona.js";
import { ORCHESTRATOR_PROMPT } from "./prompt.js";

const ORCHESTRATOR_MODEL = "claude-opus-4-7";

export interface OrchestratorInput {
  userInput: string;
  classification: IntentResult;
  packs: DomainPack[];
  hooks?: Hooks;
  // Optional Level 1 persona. Prepended to the orchestrator's system
  // prompt as the user-facing identity layer. See src/core/persona.ts.
  persona?: Persona;
  // Optional Tier 2 long-term memory preamble. Composed between the
  // persona block and the operational orchestrator prompt. Built once
  // by compose.ts at startup (and on every remember()), passed in here
  // so the orchestrator stays unaware of the storage backend. See
  // src/memory/long-term.ts.
  memoryPreamble?: string;
  // Mutually exclusive: sessionId starts a new SDK session with the given
  // UUID; resume loads a prior session's transcript. Pass exactly one
  // (or neither for legacy single-shot behavior).
  sessionId?: string;
  resume?: string;
  // Where the SDK persists session JSONL. Defaults to the SDK's own
  // ~/.claude/projects/<cwd>/ heuristic; overriding here gives stable
  // per-session storage independent of the user's shell cwd.
  cwd?: string;
  // Live event sink. Called once per NiatoEvent translated from the
  // streaming SDKMessage iterator. Errors thrown by onEvent are caught
  // and ignored — observability must never break user flows.
  onEvent?: ((event: NiatoEvent) => void) | undefined;
  // Bridge to the SDK's permission system. Hooks returning
  // permissionDecision: 'ask' cause the SDK to call this. Pass through
  // to a TUI ApprovalChannel for inline approval; omit for headless runs
  // (in which case 'ask' decisions are denied by the SDK default).
  canUseTool?: CanUseTool | undefined;
  // Test-only DI seam: replace the SDK's query() entry point. Production
  // callers leave this undefined; tests inject an async-iterable stub.
  queryImpl?: typeof query | undefined;
}

export interface OrchestratorOutput {
  result: string;
  messages: SDKMessage[];
}

// Flatten all loaded packs into a single agents map keyed by
// `<pack>.<specialist>`. The orchestrator dispatches via `subagent_type`
// using these namespaced keys.
export function mergePackAgents(
  packs: DomainPack[],
): Record<string, AgentDefinition> {
  const merged: Record<string, AgentDefinition> = {};
  for (const pack of packs) {
    for (const [name, def] of Object.entries(pack.agents)) {
      merged[`${pack.name}.${name}`] = def;
    }
  }
  return merged;
}

export function unionAllowedTools(packs: DomainPack[]): string[] {
  const tools = new Set<string>([BuiltinTools.Agent]);
  for (const pack of packs) {
    for (const def of Object.values(pack.agents)) {
      for (const tool of def.tools ?? []) {
        tools.add(tool);
      }
    }
  }
  return [...tools];
}

// Flatten each pack's contributed MCP servers into a single map keyed by
// server name. Pack-name collisions are caller-visible: the second pack
// wins, which surfaces as a duplicate-name eslint/test failure rather
// than silent override. Phase 4 ships one server (support_stub); this
// shape is what the SDK accepts as Options.mcpServers.
export function mergePackMcpServers(
  packs: DomainPack[],
): Record<string, McpServerConfig> {
  const merged: Record<string, McpServerConfig> = {};
  for (const pack of packs) {
    for (const [name, config] of Object.entries(pack.mcpServers ?? {})) {
      merged[name] = config;
    }
  }
  return merged;
}

export function buildUserMessage(input: OrchestratorInput): string {
  const recommended = pickRecommendedSpecialist(input);
  const recommendedLine =
    recommended === null
      ? "Recommended specialist: (none — no pack handles this classification)"
      : `Recommended specialist: ${recommended}`;
  const additional = pickAdditionalRecommendations(input);
  const lines = [
    `Classification: ${JSON.stringify(input.classification)}`,
    recommendedLine,
  ];
  if (additional.length > 0) {
    lines.push(
      "Additional recommendations:",
      ...additional.map(
        (a) => `  - ${a.specialist} (confidence ${a.confidence.toFixed(2)})`,
      ),
    );
  }
  lines.push("", "User input:", input.userInput);
  return lines.join("\n");
}

function pickRecommendedSpecialist(input: OrchestratorInput): string | null {
  const pack = input.packs.find((p) => p.name === input.classification.domain);
  if (!pack) return null;
  const specialist = pack.route(input.classification);
  return specialist === null ? null : `${pack.name}.${specialist}`;
}

interface AdditionalRecommendation {
  specialist: string;
  confidence: number;
}

// Resolve each cross-pack secondary intent into a fully-qualified
// specialist key (`<pack>.<specialist>`). Drops entries the orchestrator
// can't dispatch — unknown domains, intents the pack's router doesn't
// recognize, or duplicates of the primary recommendation.
export function pickAdditionalRecommendations(
  input: OrchestratorInput,
): AdditionalRecommendation[] {
  const secondaries: SecondaryIntent[] =
    input.classification.secondary ?? [];
  if (secondaries.length === 0) return [];
  const primary = pickRecommendedSpecialist(input);
  const seen = new Set<string>(primary === null ? [] : [primary]);
  const out: AdditionalRecommendation[] = [];
  for (const s of secondaries) {
    const pack = input.packs.find((p) => p.name === s.domain);
    if (pack === undefined) continue;
    const specialist = pack.route({
      intent: s.intent,
      domain: s.domain,
      confidence: s.confidence,
    });
    if (specialist === null) continue;
    const key = `${pack.name}.${specialist}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ specialist: key, confidence: s.confidence });
  }
  return out;
}

// Built-in `PreToolUse` hook prepended unconditionally — closes Phase 1's
// soft-enforcement gap. The "orchestrator dispatches only" invariant from
// ARCHITECTURE.md §5 is now hard-enforced at the SDK permission layer.
const builtInHooks: Hooks = {
  PreToolUse: [{ hooks: [agentOnlyOrchestratorHook] }],
};

// Composes the orchestrator's full system prompt:
//   persona preamble  (Level 1 — who you are)
//   ---
//   memory preamble   (Tier 2 — what you know about this user)
//   ---
//   ORCHESTRATOR_PROMPT (operational instructions)
//
// Both preambles are opt-in by presence and end in their own `---`
// separator (see buildPersonaPreamble / buildMemoryPreamble), so this
// function is just string concatenation — no extra glue. Exposed as a
// named helper so the wiring is verifiable without mocking the SDK's
// query().
export function buildOrchestratorSystemPrompt(
  persona: Persona | undefined,
  memoryPreamble?: string,
): string {
  return `${buildPersonaPreamble(persona)}${memoryPreamble ?? ""}${ORCHESTRATOR_PROMPT}`;
}

export function buildOrchestratorOptions(input: OrchestratorInput): Options {
  if (input.sessionId !== undefined && input.resume !== undefined) {
    throw new Error(
      "buildOrchestratorOptions: sessionId and resume are mutually exclusive",
    );
  }
  const mcpServers = mergePackMcpServers(input.packs);
  const systemPrompt = buildOrchestratorSystemPrompt(
    input.persona,
    input.memoryPreamble,
  );
  const options: Options = {
    model: ORCHESTRATOR_MODEL,
    systemPrompt,
    agents: mergePackAgents(input.packs),
    allowedTools: unionAllowedTools(input.packs),
    settingSources: [],
    permissionMode: "default",
    hooks: mergeHooks(builtInHooks, input.hooks ?? {}),
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.resume !== undefined ? { resume: input.resume } : {}),
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    ...(input.canUseTool !== undefined
      ? { canUseTool: input.canUseTool }
      : {}),
  };
  return options;
}

export async function runOrchestrator(
  input: OrchestratorInput,
): Promise<OrchestratorOutput> {
  const options = buildOrchestratorOptions(input);
  const messages: SDKMessage[] = [];
  let finalResult = "";
  const queryFn = input.queryImpl ?? query;

  const emit = (event: NiatoEvent): void => {
    if (input.onEvent === undefined) return;
    try {
      input.onEvent(event);
    } catch {
      // Observability sinks must never break user flows. Drop the
      // listener error silently — surfaces in traces if it matters.
    }
  };

  for await (const message of queryFn({
    prompt: buildUserMessage(input),
    options,
  })) {
    messages.push(message);
    // Translate just this message (with the empty messages-so-far prefix
    // suppressed by reading only fresh events). Cheap: each SDKMessage
    // produces O(blocks) NiatoEvents, no cross-message state.
    for (const event of messagesToEvents([message])) emit(event);
    if (message.type === "result" && message.subtype === "success") {
      finalResult = message.result;
    }
  }

  return { result: finalResult, messages };
}

import {
  query,
  type AgentDefinition,
  type McpServerConfig,
  type Options,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { type DomainPack } from "../../packs/DomainPack.js";
import { type IntentResult } from "../classifier/types.js";
import { BuiltinTools } from "../../tools/builtin.js";
import { type Hooks, mergeHooks } from "../../guardrails/hooks.js";
import { agentOnlyOrchestratorHook } from "../../guardrails/orchestrator-enforcement.js";
import { ORCHESTRATOR_PROMPT } from "./prompt.js";

const ORCHESTRATOR_MODEL = "claude-opus-4-7";

export interface OrchestratorInput {
  userInput: string;
  classification: IntentResult;
  packs: DomainPack[];
  hooks?: Hooks;
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

function buildUserMessage(input: OrchestratorInput): string {
  const recommended = pickRecommendedSpecialist(input);
  const recommendedLine =
    recommended === null
      ? "Recommended specialist: (none — no pack handles this classification)"
      : `Recommended specialist: ${recommended}`;
  return [
    `Classification: ${JSON.stringify(input.classification)}`,
    recommendedLine,
    "",
    "User input:",
    input.userInput,
  ].join("\n");
}

function pickRecommendedSpecialist(input: OrchestratorInput): string | null {
  const pack = input.packs.find((p) => p.name === input.classification.domain);
  if (!pack) return null;
  const specialist = pack.route(input.classification);
  return specialist === null ? null : `${pack.name}.${specialist}`;
}

// Built-in `PreToolUse` hook prepended unconditionally — closes Phase 1's
// soft-enforcement gap. The "orchestrator dispatches only" invariant from
// ARCHITECTURE.md §5 is now hard-enforced at the SDK permission layer.
const builtInHooks: Hooks = {
  PreToolUse: [{ hooks: [agentOnlyOrchestratorHook] }],
};

export async function runOrchestrator(
  input: OrchestratorInput,
): Promise<OrchestratorOutput> {
  const mcpServers = mergePackMcpServers(input.packs);
  const options: Options = {
    model: ORCHESTRATOR_MODEL,
    systemPrompt: ORCHESTRATOR_PROMPT,
    agents: mergePackAgents(input.packs),
    allowedTools: unionAllowedTools(input.packs),
    settingSources: [],
    permissionMode: "default",
    hooks: mergeHooks(builtInHooks, input.hooks ?? {}),
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
  };

  const messages: SDKMessage[] = [];
  let finalResult = "";

  for await (const message of query({
    prompt: buildUserMessage(input),
    options,
  })) {
    messages.push(message);
    if (message.type === "result" && message.subtype === "success") {
      finalResult = message.result;
    }
  }

  return { result: finalResult, messages };
}

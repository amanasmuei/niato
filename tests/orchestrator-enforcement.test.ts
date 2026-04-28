import { describe, it, expect } from "vitest";
import {
  type HookInput,
  type HookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";
import { agentOnlyOrchestratorHook } from "../src/guardrails/orchestrator-enforcement.js";

const baseFields = {
  session_id: "test-session",
  transcript_path: "/tmp/transcript",
  cwd: "/tmp",
};

function preToolUseInput(overrides: {
  tool_name: string;
  agent_id?: string;
}): HookInput {
  return {
    ...baseFields,
    hook_event_name: "PreToolUse",
    tool_name: overrides.tool_name,
    tool_input: {},
    tool_use_id: "tool-use-1",
    ...(overrides.agent_id !== undefined ? { agent_id: overrides.agent_id } : {}),
  };
}

interface DenyOutcome {
  decision: "deny";
  reason: string;
}

function getPreToolUseDeny(output: HookJSONOutput): DenyOutcome | undefined {
  if (!("hookSpecificOutput" in output)) return undefined;
  const hso = output.hookSpecificOutput;
  if (hso.hookEventName !== "PreToolUse") return undefined;
  if (hso.permissionDecision !== "deny") return undefined;
  return { decision: "deny", reason: hso.permissionDecisionReason ?? "" };
}

const noopOptions = { signal: new AbortController().signal };

describe("agentOnlyOrchestratorHook", () => {
  it("denies a main-thread Read call and names the blocked tool in the reason", async () => {
    const result = await agentOnlyOrchestratorHook(
      preToolUseInput({ tool_name: "Read" }),
      "tool-use-1",
      noopOptions,
    );
    const deny = getPreToolUseDeny(result);
    expect(deny).toBeDefined();
    expect(deny?.reason).toContain("Read");
  });

  it("denies a main-thread Bash call", async () => {
    const result = await agentOnlyOrchestratorHook(
      preToolUseInput({ tool_name: "Bash" }),
      "tool-use-2",
      noopOptions,
    );
    expect(getPreToolUseDeny(result)?.reason).toContain("Bash");
  });

  // Phase 4 regression: once a pack registers an in-process MCP server, the
  // server's tool names enter `Options.allowedTools` via `unionAllowedTools`.
  // The orchestrator could in principle call the MCP tool directly from the
  // main thread; this hook is the only thing stopping that. Locks the
  // invariant in place ahead of the Support pack's `support_stub` MCP.
  it("denies a main-thread call to a pack-provided MCP tool", async () => {
    const result = await agentOnlyOrchestratorHook(
      preToolUseInput({ tool_name: "mcp__support_stub__issue_refund" }),
      "tool-use-mcp",
      noopOptions,
    );
    expect(getPreToolUseDeny(result)?.reason).toContain(
      "mcp__support_stub__issue_refund",
    );
  });

  it("allows a main-thread Agent dispatch", async () => {
    const result = await agentOnlyOrchestratorHook(
      preToolUseInput({ tool_name: "Agent" }),
      "tool-use-3",
      noopOptions,
    );
    expect(result).toEqual({ continue: true });
  });

  it("allows the legacy Task alias from the orchestrator", async () => {
    const result = await agentOnlyOrchestratorHook(
      preToolUseInput({ tool_name: "Task" }),
      "tool-use-4",
      noopOptions,
    );
    expect(result).toEqual({ continue: true });
  });

  it("allows any tool call from a subagent (agent_id present)", async () => {
    const result = await agentOnlyOrchestratorHook(
      preToolUseInput({ tool_name: "Read", agent_id: "subagent-abc" }),
      "tool-use-5",
      noopOptions,
    );
    expect(result).toEqual({ continue: true });
  });

  it("ignores non-PreToolUse events", async () => {
    const stopInput: HookInput = {
      ...baseFields,
      hook_event_name: "Stop",
      stop_hook_active: false,
    };
    const result = await agentOnlyOrchestratorHook(
      stopInput,
      undefined,
      noopOptions,
    );
    expect(result).toEqual({ continue: true });
  });
});

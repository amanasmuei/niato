import { type HookCallback } from "@anthropic-ai/claude-agent-sdk";

// Hard enforcement of the architectural invariant from ARCHITECTURE.md §5:
// the orchestrator may only dispatch specialists via the `Agent` tool; it
// must never execute work itself. This hook is registered as a built-in
// `PreToolUse` callback by `runOrchestrator` — there is no opt-out.
//
// `BaseHookInput.agent_id` distinguishes main-thread calls (orchestrator)
// from subagent calls. The SDK docs state: "Present only when the hook
// fires from within a subagent. Absent for the main thread." So
// `agent_id === undefined` => orchestrator. The dispatch tool is `Agent`
// (alias `Task` retained for back-compat across SDK versions).
export const agentOnlyOrchestratorHook: HookCallback = (input) => {
  if (input.hook_event_name !== "PreToolUse") {
    return Promise.resolve({ continue: true });
  }
  if (input.agent_id !== undefined) {
    return Promise.resolve({ continue: true });
  }
  if (input.tool_name === "Agent" || input.tool_name === "Task") {
    return Promise.resolve({ continue: true });
  }
  return Promise.resolve({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `Orchestrator may only dispatch via Agent; blocked direct ${input.tool_name} call.`,
    },
  });
};

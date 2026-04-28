import {
  type HookCallback,
  type HookCallbackMatcher,
} from "@anthropic-ai/claude-agent-sdk";

// Pack-scoped PreToolUse hook factory. Scoped to a single tool by name via
// the matcher field — see ARCHITECTURE.md §7.2's refundApprovalGate /
// dollarLimitHook. Phase 4 collapses those into one factory: the threshold
// IS the gate. Refunds at or above `autoApproveBelow` are denied with a
// reason that surfaces back to the orchestrator, which routes to escalate.

export interface DollarLimitOptions {
  tool: string;
  autoApproveBelow: number;
  // Field name on `tool_input` carrying the dollar amount. Defaults to
  // `amount_usd` to match the support_stub `issue_refund` schema.
  amountField?: string;
}

function readAmount(toolInput: unknown, field: string): number | null {
  if (typeof toolInput !== "object" || toolInput === null) return null;
  const value = (toolInput as Record<string, unknown>)[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function dollarLimit(
  options: DollarLimitOptions,
): HookCallbackMatcher {
  const field = options.amountField ?? "amount_usd";
  const callback: HookCallback = (input) => {
    if (input.hook_event_name !== "PreToolUse") {
      return Promise.resolve({ continue: true });
    }
    // The matcher already scopes us to `options.tool`, but defending in
    // depth: bail if for some reason a different tool reaches us.
    if (input.tool_name !== options.tool) {
      return Promise.resolve({ continue: true });
    }
    const amount = readAmount(input.tool_input, field);
    if (amount === null) {
      // No amount field => can't gate. Pass through so a downstream hook or
      // the model itself can reject.
      return Promise.resolve({ continue: true });
    }
    if (amount >= options.autoApproveBelow) {
      return Promise.resolve({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `Refund of $${amount.toFixed(2)} requires human approval (auto-approve threshold is $${options.autoApproveBelow.toFixed(2)}). Forward to escalate.`,
        },
      });
    }
    return Promise.resolve({ continue: true });
  };
  return { matcher: options.tool, hooks: [callback] };
}

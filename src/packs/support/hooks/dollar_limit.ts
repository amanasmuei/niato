import {
  type HookCallback,
  type HookCallbackMatcher,
} from "@anthropic-ai/claude-agent-sdk";

// Pack-scoped PreToolUse hook factory. Phase 4.5: refunds at or above
// `autoApproveBelow` return permissionDecision: 'ask', which the SDK
// routes to Options.canUseTool — typically a TUI ApprovalChannel for
// inline approval (see src/guardrails/approval-channel.ts and the
// LivePanel keypress flow). Headless deployments fall back to Niato's
// built-in headlessDenyCanUseTool (see src/core/compose.ts), which
// auto-denies any 'ask' decision. The deny posture is therefore
// explicit and SDK-version-independent, not inferred from SDK fallback
// behavior — preserves the prior safety stance exactly.

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
          permissionDecision: "ask",
          permissionDecisionReason: `Refund of $${amount.toFixed(2)} exceeds auto-approve threshold of $${options.autoApproveBelow.toFixed(2)}. Approve or deny to continue.`,
        },
      });
    }
    return Promise.resolve({ continue: true });
  };
  return { matcher: options.tool, hooks: [callback] };
}

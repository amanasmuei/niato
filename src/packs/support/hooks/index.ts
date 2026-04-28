import { type Hooks } from "../../../guardrails/hooks.js";
import { piiRedactionHook } from "./pii_redaction.js";
import { dollarLimit } from "./dollar_limit.js";
import { SupportStubTools } from "../tools/support_stub.js";

// Support pack's hook layer. Merged into the orchestrator's Options.hooks
// after the built-in invariants and global hooks (see compose.ts).
//
// PII redaction runs on every PreToolUse from this pack's specialists (no
// matcher). The dollar-limit gate is scoped to the refund tool only.
// Auto-approve threshold is $20 per ARCHITECTURE.md §7.2.
export const supportHooks: Hooks = {
  PreToolUse: [
    { hooks: [piiRedactionHook] },
    dollarLimit({
      tool: SupportStubTools.issue_refund,
      autoApproveBelow: 20,
    }),
  ],
};

export { piiRedactionHook } from "./pii_redaction.js";
export { dollarLimit, type DollarLimitOptions } from "./dollar_limit.js";

import { type Hooks } from "../../../guardrails/hooks.js";
import { sandboxBashHook } from "./sandbox_bash.js";
import { secretsScanHook } from "./secrets_scan.js";
import { protectedBranchGate } from "./protected_branch_gate.js";

// Dev Tools pack hook layer. Merged into the orchestrator's Options.hooks
// after the built-in invariants and global hooks.
//
// secretsScanHook fires on every PreToolUse from this pack's specialists
// (no matcher). sandboxBashHook is matcher-scoped to the Bash tool.
// protectedBranchGate is matcher-scoped to the create_pull_request tool.
// Order matters because the first hook to deny short-circuits the SDK's
// permission flow: secrets-scan first (catches secrets in any tool input
// including PR bodies), then sandbox-bash, then protected-branch-gate.
export const devToolsHooks: Hooks = {
  PreToolUse: [
    { hooks: [secretsScanHook] },
    sandboxBashHook(),
    protectedBranchGate(),
  ],
};

export { sandboxBashHook, type SandboxBashOptions } from "./sandbox_bash.js";
export { secretsScanHook, findSecret } from "./secrets_scan.js";
export {
  protectedBranchGate,
  type ProtectedBranchGateOptions,
} from "./protected_branch_gate.js";

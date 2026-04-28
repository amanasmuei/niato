import { type Hooks } from "../../../guardrails/hooks.js";
import { sandboxBashHook } from "./sandbox_bash.js";
import { secretsScanHook } from "./secrets_scan.js";

// Dev Tools pack hook layer. Merged into the orchestrator's Options.hooks
// after the built-in invariants and global hooks.
//
// secretsScanHook fires on every PreToolUse from this pack's specialists
// (no matcher). sandboxBashHook is matcher-scoped to the Bash tool only.
// secrets-scan runs before sandbox in the merged array — order matters
// because the first hook to deny short-circuits the SDK's permission flow.
export const devToolsHooks: Hooks = {
  PreToolUse: [{ hooks: [secretsScanHook] }, sandboxBashHook()],
};

export { sandboxBashHook, type SandboxBashOptions } from "./sandbox_bash.js";
export { secretsScanHook, findSecret } from "./secrets_scan.js";

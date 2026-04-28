import {
  type HookCallback,
  type HookCallbackMatcher,
} from "@anthropic-ai/claude-agent-sdk";

// Pack-scoped PreToolUse hook factory. Matcher-scoped to the Bash tool;
// denies any command that isn't on a small allowlist of test runners. Two
// gates run in sequence:
//
// 1. Compound-operator check. Anything containing && || ; | > < $( backtick
//    is denied — those let an allowlisted prefix smuggle in a non-test
//    payload (e.g. `pnpm test && rm -rf /`).
// 2. Allowlist regex match against the start of the (trimmed) command.
//
// Phase 5 keeps the allowlist deliberately small. Add entries only when a
// concrete need arises and a real test runs the resulting command.

const COMPOUND_PATTERN = /[&|;`]|\$\(|>|<|\\/;

const DEFAULT_ALLOWED: readonly RegExp[] = [
  /^npm\s+(?:run\s+)?test\b/,
  /^pnpm\s+(?:run\s+)?test\b/,
  /^yarn\s+test\b/,
  /^pytest\b/,
  /^python\s+-m\s+pytest\b/,
  /^cargo\s+test\b/,
  /^go\s+test\b/,
  /^vitest\s+run\b/,
];

export interface SandboxBashOptions {
  // Override the default test-runner allowlist. Each entry must anchor at
  // ^ and use \b (or equivalent) so prefix matching is well-defined.
  allowedCommands?: readonly RegExp[];
}

function readCommand(toolInput: unknown): string | null {
  if (typeof toolInput !== "object" || toolInput === null) return null;
  const value = (toolInput as Record<string, unknown>)["command"];
  return typeof value === "string" ? value : null;
}

function matchesAllowlist(
  command: string,
  patterns: readonly RegExp[],
): boolean {
  for (const p of patterns) {
    if (p.test(command)) return true;
  }
  return false;
}

export function sandboxBashHook(
  options: SandboxBashOptions = {},
): HookCallbackMatcher {
  const patterns = options.allowedCommands ?? DEFAULT_ALLOWED;
  const callback: HookCallback = (input) => {
    if (input.hook_event_name !== "PreToolUse") {
      return Promise.resolve({ continue: true });
    }
    if (input.tool_name !== "Bash") {
      return Promise.resolve({ continue: true });
    }
    const command = readCommand(input.tool_input);
    if (command === null) {
      return Promise.resolve({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            "Bash tool input has no `command` string — sandbox cannot evaluate.",
        },
      });
    }
    const trimmed = command.trim();
    if (COMPOUND_PATTERN.test(trimmed)) {
      return Promise.resolve({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `Bash command contains a shell compound operator and is denied by sandbox. Run a single test command at a time. Got: ${trimmed.slice(0, 120)}`,
        },
      });
    }
    if (!matchesAllowlist(trimmed, patterns)) {
      return Promise.resolve({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `Bash command not in test-runner allowlist. The bug_fixer specialist may only run tests (npm test, pnpm test, pytest, vitest run, cargo test, go test, etc.). Got: ${trimmed.slice(0, 120)}`,
        },
      });
    }
    return Promise.resolve({ continue: true });
  };
  return { matcher: "Bash", hooks: [callback] };
}

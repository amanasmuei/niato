import { type HookCallback } from "@anthropic-ai/claude-agent-sdk";

// Pack-scoped PreToolUse hook (no matcher — fires on every Dev Tools tool
// call). Denies any tool input whose serialized form contains a recognized
// secret pattern. Same shape as Phase 4's piiRedactionHook, different
// patterns. Conservative — patterns chosen to be high-precision so the
// false-positive rate on normal codebases stays low.

const SECRET_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  // GitHub personal access tokens / fine-grained tokens / OAuth tokens.
  { name: "GitHub token", pattern: /\bgh[opsu]_[A-Za-z0-9]{36}\b/ },
  // Anthropic / OpenAI / similar sk- prefixed keys. The {20,} threshold
  // avoids matching short identifiers that happen to start with sk-.
  { name: "API key (sk- prefix)", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
];

export function findSecret(
  text: string,
): { name: string; match: string } | null {
  for (const { name, pattern } of SECRET_PATTERNS) {
    const m = text.match(pattern);
    if (m !== null) return { name, match: m[0] };
  }
  return null;
}

export const secretsScanHook: HookCallback = (input) => {
  if (input.hook_event_name !== "PreToolUse") {
    return Promise.resolve({ continue: true });
  }
  const serialized = JSON.stringify(input.tool_input);
  const hit = findSecret(serialized);
  if (hit !== null) {
    return Promise.resolve({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Secret detected in tool input (${hit.name}). Never paste credentials into tool calls — reference them via env vars or a vault path instead.`,
      },
    });
  }
  return Promise.resolve({ continue: true });
};

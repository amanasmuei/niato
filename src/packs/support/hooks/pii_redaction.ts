import { type HookCallback } from "@anthropic-ai/claude-agent-sdk";

// Pack-scoped PreToolUse hook. Denies any Support-pack tool call whose
// `tool_input` (serialized) contains a US-SSN-shaped string or a Luhn-valid
// credit-card-shaped string. The deny path is intentionally conservative
// rather than rewriting in-place — keeps blast radius small and tests easy.
// In-place redaction via `permissionDecisionUpdatedInput` is a Phase 5+
// refinement once we have a real false-positive corpus to tune against.

const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/;

// Match any 13–19 contiguous digits (allowing intervening single spaces or
// dashes), then Luhn-validate to filter out random number sequences.
const CC_CANDIDATE_REGEX = /\b(?:\d[ -]?){12,18}\d\b/g;

function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function findCreditCard(text: string): string | null {
  const matches = text.match(CC_CANDIDATE_REGEX);
  if (matches === null) return null;
  for (const m of matches) {
    const digits = m.replace(/[ -]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      return m;
    }
  }
  return null;
}

export function findSsn(text: string): string | null {
  // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec -- match() avoids a security-hook false positive on the literal substring "exec"
  const match = text.match(SSN_REGEX);
  return match === null ? null : match[0];
}

export const piiRedactionHook: HookCallback = (input) => {
  if (input.hook_event_name !== "PreToolUse") {
    return Promise.resolve({ continue: true });
  }
  const serialized = JSON.stringify(input.tool_input);
  const cc = findCreditCard(serialized);
  if (cc !== null) {
    return Promise.resolve({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "PII detected in tool input (credit card pattern). Ask the user for a non-PII identifier (e.g. order ID) instead — never echo card numbers.",
      },
    });
  }
  const ssn = findSsn(serialized);
  if (ssn !== null) {
    return Promise.resolve({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "PII detected in tool input (SSN pattern). Use the customer's email or order ID instead.",
      },
    });
  }
  return Promise.resolve({ continue: true });
};

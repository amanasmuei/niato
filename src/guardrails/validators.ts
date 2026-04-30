// Synchronous predicate over the raw user input, run by compose.run()
// before classification. Returning `{ok: false, reason}` aborts the turn
// with a NiatoInputRejectedError; returning `{ok: true}` lets the next
// validator run.
export type InputValidatorResult =
  | { ok: true }
  | { ok: false; reason: string };

export type InputValidator = (input: string) => InputValidatorResult;

export function maxLengthValidator(maxLength: number): InputValidator {
  return (input) => {
    if (input.length > maxLength) {
      return {
        ok: false,
        reason: `Input exceeds max length: ${String(input.length)} > ${String(maxLength)}`,
      };
    }
    return { ok: true };
  };
}

// Conservative regex pass for the most common prompt-injection patterns.
// Not comprehensive; not a substitute for proper hardening (sandbox the
// orchestrator, allowlist tools per specialist, gate destructive ops with
// hooks). Intent is to catch the obvious "ignore previous instructions"
// class of payload before it consumes any model tokens.
const PROMPT_INJECTION_PATTERNS: readonly RegExp[] = [
  /\bignore\s+(?:(?:all|previous|prior|the)\s+){0,2}(?:instructions?|directions?|prompts?|rules?)/i,
  /\bdisregard\s+(?:(?:all|the|previous|prior)\s+){0,2}(?:above|previous|prior|instructions?|rules?)/i,
  /\byour\s+new\s+(?:system\s+prompt|task|role|instructions?|system|prompt)\s+(?:is|are)\b/i,
  /<\|im_start\|>/,
  /<\|im_end\|>/,
];

export function promptInjectionValidator(): InputValidator {
  return (input) => {
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      const match = input.match(pattern);
      if (match !== null) {
        return {
          ok: false,
          reason: `Input matches a prompt-injection pattern: ${JSON.stringify(match[0])}`,
        };
      }
    }
    return { ok: true };
  };
}

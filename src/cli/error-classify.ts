import { NiatoAuthError } from "../core/errors.js";

export type ErrorKind =
  | "auth"
  | "auth-expired"
  | "rate-limit"
  | "network"
  | "malformed-response";

export interface ClassifiedError {
  kind: ErrorKind;
  message: string;
  // Original message preserved for the trace/logs (not shown to the user
  // by default; UIs can choose to surface it via a "show details" toggle).
  raw: string;
}

const NETWORK_PATTERNS = [
  /fetch failed/i,
  /ECONNREFUSED/,
  /ECONNRESET/,
  /ENOTFOUND/,
  /ETIMEDOUT/,
  /network request failed/i,
];

const AUTH_EXPIRED_PATTERNS = [
  /\b401\b/,
  /unauthorized/i,
  /authentication failed/i,
  /invalid api key/i,
];

const RATE_LIMIT_PATTERNS = [
  /\b429\b/,
  /rate[_ ]?limit/i,
  /too many requests/i,
];

const MALFORMED_PATTERNS = [/zod/i, /invalid intent classification/i];

export function classifyError(err: unknown): ClassifiedError | null {
  if (err instanceof NiatoAuthError) {
    return { kind: "auth", message: err.message, raw: err.message };
  }
  if (!(err instanceof Error)) return null;
  const raw = err.message;

  if (RATE_LIMIT_PATTERNS.some((p) => p.test(raw))) {
    return {
      kind: "rate-limit",
      message:
        "Anthropic rate limit hit. Wait a moment and try again — your turn was not charged.",
      raw,
    };
  }
  if (AUTH_EXPIRED_PATTERNS.some((p) => p.test(raw))) {
    return {
      kind: "auth-expired",
      message:
        "Auth invalid or expired. Re-run `niato` and re-authenticate from Settings.",
      raw,
    };
  }
  if (NETWORK_PATTERNS.some((p) => p.test(raw))) {
    return {
      kind: "network",
      message:
        "Could not reach Anthropic. Check your network connection and try again.",
      raw,
    };
  }
  if (MALFORMED_PATTERNS.some((p) => p.test(raw))) {
    return {
      kind: "malformed-response",
      message:
        "Got an unexpected response from the model. Try again — this is usually transient.",
      raw,
    };
  }
  return null;
}

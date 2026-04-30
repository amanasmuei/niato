import { NawaituAuthError } from "./core/errors.js";

// CLI-side renderer for typed Nawaitu errors. Returns a string ready to
// write to stderr, or null if the error isn't one we know how to render
// (callers fall through to their default error path).
export function renderAuthError(err: unknown): string | null {
  if (!(err instanceof NawaituAuthError)) return null;
  return `nawaitu: ${err.message}`;
}

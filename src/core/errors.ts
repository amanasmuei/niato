// Typed errors callers can render directly. NawaituAuthError signals that
// no usable authentication mode was configured at startup. Thrown by
// resolveAuthMode when neither ANTHROPIC_API_KEY nor NAWAITU_AUTH=subscription
// is set, so callers can show a friendly fix-it message instead of a stack
// trace.
export class NawaituAuthError extends Error {
  override readonly name = "NawaituAuthError";
}

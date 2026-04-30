// Typed errors callers can render directly. NiatoAuthError signals that
// no usable authentication mode was configured at startup. Thrown by
// resolveAuthMode when neither ANTHROPIC_API_KEY nor NIATO_AUTH=subscription
// is set, so callers can show a friendly fix-it message instead of a stack
// trace.
export class NiatoAuthError extends Error {
  override readonly name = "NiatoAuthError";
}

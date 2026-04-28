// Thrown by `nawaitu.run()` when an input validator rejects the user
// message before classification. Surfaces a structured `reason` so the
// caller can show the user a clean message without the stack.
export class NawaituInputRejectedError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Input rejected: ${reason}`);
    this.name = "NawaituInputRejectedError";
    this.reason = reason;
  }
}

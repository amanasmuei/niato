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

// Thrown by `nawaitu.run()` at turn start when a session's cumulative cost
// has already met or exceeded the configured `costLimitUsd`. The turn is
// rejected before classification so no further tokens are spent. Mid-turn
// cost throttling is deferred to Phase 7 — see ARCHITECTURE.md §15.
export class NawaituBudgetExceededError extends Error {
  readonly cumulativeUsd: number;
  readonly limitUsd: number;
  constructor(cumulativeUsd: number, limitUsd: number) {
    super(
      `Session cost limit exceeded: cumulative $${cumulativeUsd.toFixed(4)} ≥ limit $${limitUsd.toFixed(4)}`,
    );
    this.name = "NawaituBudgetExceededError";
    this.cumulativeUsd = cumulativeUsd;
    this.limitUsd = limitUsd;
  }
}

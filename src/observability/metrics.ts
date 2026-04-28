import { type TurnRecord } from "./trace.js";

// Aggregated counts and rolling totals for one session, updated after every
// turn settles. Single source of truth for per-session aggregates —
// SessionContext exposes only `metrics`, not duplicate top-level fields.
// Production deployments that need cross-process aggregation wire it
// through NawaituOptions.onTurnComplete rather than reading this map.
export interface SessionMetrics {
  turnCount: number;
  cumulativeCostUsd: number;
  cumulativeLatencyMs: number;
  // tool_name → count of times denied by any hook
  guardrailsTriggered: Record<string, number>;
  // "<pack>.<specialist>" → count of dispatches across the session
  dispatchesByPackSpecialist: Record<string, number>;
  // turns whose orchestrator outcome was "error"
  errorCount: number;
}

export function emptySessionMetrics(): SessionMetrics {
  return {
    turnCount: 0,
    cumulativeCostUsd: 0,
    cumulativeLatencyMs: 0,
    guardrailsTriggered: {},
    dispatchesByPackSpecialist: {},
    errorCount: 0,
  };
}

// Folds a single TurnRecord into the rolling per-session metrics. Mutates
// in place so the live SessionContext.metrics ledger updates without an
// extra reassignment in compose.run().
export function updateSessionMetrics(
  metrics: SessionMetrics,
  trace: TurnRecord,
): void {
  metrics.turnCount += 1;
  metrics.cumulativeCostUsd += trace.costUsd;
  metrics.cumulativeLatencyMs += trace.latencyMs;
  if (trace.outcome === "error") {
    metrics.errorCount += 1;
  }
  for (const tool of trace.guardrailsTriggered) {
    metrics.guardrailsTriggered[tool] =
      (metrics.guardrailsTriggered[tool] ?? 0) + 1;
  }
  for (const specialist of trace.plan) {
    metrics.dispatchesByPackSpecialist[specialist] =
      (metrics.dispatchesByPackSpecialist[specialist] ?? 0) + 1;
  }
}

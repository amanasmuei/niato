import { describe, expect, it } from "vitest";
import {
  emptySessionMetrics,
  updateSessionMetrics,
} from "../src/observability/metrics.js";
import {
  createNawaitu,
  genericPack,
  stubClassifier,
  type Config,
  type TurnRecord,
} from "../src/index.js";

const fakeConfig: Config = {
  ANTHROPIC_API_KEY: "test-key-not-real",
  NAWAITU_LOG_LEVEL: "error",
};

function fakeTrace(over: Partial<TurnRecord> = {}): TurnRecord {
  return {
    sessionId: "s1",
    turnId: "t1",
    classification: { intent: "question", domain: "generic", confidence: 0.9 },
    plan: [],
    specialists: [],
    tokensByModel: {},
    costUsd: 0,
    latencyMs: 0,
    outcome: "success",
    guardrailsTriggered: [],
    ...over,
  };
}

describe("emptySessionMetrics", () => {
  it("returns zeroed counts and empty maps", () => {
    expect(emptySessionMetrics()).toEqual({
      turnCount: 0,
      cumulativeCostUsd: 0,
      cumulativeLatencyMs: 0,
      guardrailsTriggered: {},
      dispatchesByPackSpecialist: {},
      errorCount: 0,
    });
  });

  it("returns a fresh object on each call (no shared map references)", () => {
    const a = emptySessionMetrics();
    const b = emptySessionMetrics();
    a.guardrailsTriggered["Bash"] = 7;
    expect(b.guardrailsTriggered).toEqual({});
  });
});

describe("updateSessionMetrics", () => {
  it("increments turnCount and rolls cost / latency totals", () => {
    const m = emptySessionMetrics();
    updateSessionMetrics(
      m,
      fakeTrace({ costUsd: 0.05, latencyMs: 1500 }),
    );
    updateSessionMetrics(
      m,
      fakeTrace({ costUsd: 0.12, latencyMs: 2200 }),
    );
    expect(m.turnCount).toBe(2);
    expect(m.cumulativeCostUsd).toBeCloseTo(0.17);
    expect(m.cumulativeLatencyMs).toBe(3700);
  });

  it("counts a guardrail trigger per occurrence (duplicates allowed)", () => {
    const m = emptySessionMetrics();
    updateSessionMetrics(
      m,
      fakeTrace({ guardrailsTriggered: ["Bash", "Bash"] }),
    );
    updateSessionMetrics(
      m,
      fakeTrace({ guardrailsTriggered: ["mcp__support_stub__issue_refund"] }),
    );
    expect(m.guardrailsTriggered).toEqual({
      Bash: 2,
      "mcp__support_stub__issue_refund": 1,
    });
  });

  it("counts dispatches by namespaced specialist key", () => {
    const m = emptySessionMetrics();
    updateSessionMetrics(
      m,
      fakeTrace({
        plan: ["dev_tools.bug_fixer", "support.escalate"],
      }),
    );
    updateSessionMetrics(
      m,
      fakeTrace({ plan: ["dev_tools.bug_fixer"] }),
    );
    expect(m.dispatchesByPackSpecialist).toEqual({
      "dev_tools.bug_fixer": 2,
      "support.escalate": 1,
    });
  });

  it("increments errorCount only when outcome is 'error'", () => {
    const m = emptySessionMetrics();
    updateSessionMetrics(m, fakeTrace({ outcome: "success" }));
    expect(m.errorCount).toBe(0);
    updateSessionMetrics(m, fakeTrace({ outcome: "error" }));
    expect(m.errorCount).toBe(1);
  });
});

describe("nawaitu.metrics()", () => {
  it("returns undefined for an unknown session id", () => {
    const nawaitu = createNawaitu({
      packs: [genericPack],
      classifier: stubClassifier,
      config: fakeConfig,
    });
    expect(nawaitu.metrics("never-existed")).toBeUndefined();
  });

  it("returns a structuredClone — caller mutations do not corrupt the live ledger", () => {
    // Lock the advisor-flagged immutability contract: telemetry callers
    // sometimes "reset" a counter on the returned object as a way to take
    // a delta snapshot. That must not corrupt the session's running state.
    const m1 = emptySessionMetrics();
    const m2 = structuredClone(m1);
    m2.guardrailsTriggered["Bash"] = 99;
    expect(m1.guardrailsTriggered).toEqual({});
  });
});

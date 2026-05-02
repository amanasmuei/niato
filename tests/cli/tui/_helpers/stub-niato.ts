import {
  type Niato,
  type NiatoTurn,
} from "../../../../src/core/compose.js";
import {
  emptySessionMetrics,
  type SessionMetrics,
} from "../../../../src/observability/metrics.js";
import { type SessionContext } from "../../../../src/memory/session.js";
import { type NiatoEvent } from "../../../../src/observability/events.js";

export interface StubResponse {
  output: string;
  delayMs?: number;
  throws?: Error;
}

// Test double for Niato used by hook + screen tests. Pops canned responses
// in order; falls back to a synthetic "no canned response" string so a test
// over-running its fixture fails loudly instead of returning undefined.
//
// Stub-vs-real shape alignment (see plan's "CRITICAL — likely test fixture
// issues" callout):
//   • TurnRecord.outcome must be "success" | "error" (plan literal said
//     "ok" — wrong). guardrailsTriggered is string[], not {}. specialists
//     is a required field, not optional.
//   • SessionMetrics requires dispatchesByPackSpecialist alongside the
//     fields the plan's literal stub listed.
//   • Niato.metrics takes a sessionId arg (plan literal had zero args).
export function makeStubNiato(responses: StubResponse[]): Niato {
  let i = 0;
  return {
    async run(input, sessionId): Promise<NiatoTurn> {
      const r = responses[i++] ?? {
        output: `(no canned response for: ${input})`,
      };
      if (r.delayMs !== undefined)
        await new Promise((res) => setTimeout(res, r.delayMs));
      if (r.throws) throw r.throws;
      const id = sessionId ?? "stub-session";
      const metrics: SessionMetrics = emptySessionMetrics();
      metrics.turnCount = i;
      const session: SessionContext = {
        id,
        createdAt: new Date(0),
        metrics,
        started: false,
      };
      return {
        result: r.output,
        classification: {
          domain: "generic",
          intent: "explain",
          confidence: 0.9,
        },
        session,
        messages: [],
        trace: {
          sessionId: id,
          turnId: `t${String(i)}`,
          classification: {
            domain: "generic",
            intent: "explain",
            confidence: 0.9,
          },
          plan: ["generic.explain"],
          specialists: [],
          costUsd: 0.001,
          startedAt: "2026-01-01T00:00:00.000Z",
          latencyMs: 50,
          tokensByModel: {},
          outcome: "success",
          guardrailsTriggered: [],
        },
      };
    },
    runStream(
      input: string,
      sessionId: string | undefined,
      onEvent: (event: NiatoEvent) => void,
    ): Promise<NiatoTurn> {
      // Stub: emit a minimal lifecycle event sequence so consumers
      // exercise the codepath, then delegate to run() for the actual
      // turn shape. Real intermediate events (classified, tool_*) are
      // not emitted — the stub Niato is a fixture, not an SDK simulator.
      onEvent({
        type: "turn_start",
        sessionId: sessionId ?? "stub-session",
        turnId: `t${String(i + 1)}`,
        userInput: input,
      });
      return this.run(input, sessionId).then((turn) => {
        onEvent({ type: "turn_complete", trace: turn.trace });
        return turn;
      });
    },
    metrics(_sessionId): SessionMetrics | undefined {
      return undefined;
    },
    remember(_facts: string[]): Promise<void> {
      // Stub: long-term memory is not exercised by TUI tests today. Real
      // wiring lives in tests/long-term-memory.test.ts and
      // tests/file-memory-store.test.ts.
      return Promise.resolve();
    },
  };
}

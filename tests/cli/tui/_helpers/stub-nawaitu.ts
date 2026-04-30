import {
  type Nawaitu,
  type NawaituTurn,
} from "../../../../src/core/compose.js";
import {
  emptySessionMetrics,
  type SessionMetrics,
} from "../../../../src/observability/metrics.js";
import { type SessionContext } from "../../../../src/memory/session.js";

export interface StubResponse {
  output: string;
  delayMs?: number;
  throws?: Error;
}

// Test double for Nawaitu used by hook + screen tests. Pops canned responses
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
//   • Nawaitu.metrics takes a sessionId arg (plan literal had zero args).
export function makeStubNawaitu(responses: StubResponse[]): Nawaitu {
  let i = 0;
  return {
    async run(input, sessionId): Promise<NawaituTurn> {
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
          latencyMs: 50,
          tokensByModel: {},
          outcome: "success",
          guardrailsTriggered: [],
        },
      };
    },
    metrics(_sessionId): SessionMetrics | undefined {
      return undefined;
    },
  };
}

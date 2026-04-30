import { describe, expect, it } from "vitest";
import {
  createNiato,
  extractAgentDispatches,
  supportPack,
} from "../src/index.js";

// Phase 4 end-to-end smoke. One real turn per scenario:
//   1. order_status → ticket_lookup specialist actually dispatches.
//   2. refund under $20 → refund_processor dispatches and the dollar-limit
//      hook does NOT block it.
//   3. refund at/above $20 → dollar-limit hook denies; the orchestrator's
//      response should reflect the denial (deny reason text contains
//      "human approval" — surfaces back to the agent loop).
//
// Each turn costs ~$0.05; total ~$0.15. Skipped without ANTHROPIC_API_KEY.
const hasKey = Boolean(process.env["ANTHROPIC_API_KEY"]);

describe.skipIf(!hasKey)("smoke: Support pack end-to-end", () => {
  it("dispatches support.ticket_lookup for an order_status query", async () => {
    const niato = createNiato({ packs: [supportPack] });
    const turn = await niato.run(
      "What's the status of ticket TKT-12345? It's been a few days.",
    );

    const dispatches = extractAgentDispatches(turn.messages);
    expect(dispatches).toContain("support.ticket_lookup");
    expect(turn.classification.domain).toBe("support");
    expect(turn.classification.intent).toBe("order_status");
    expect(turn.trace.outcome).toBe("success");
    expect(turn.result).toBeTruthy();
  }, 180_000);

  it("dispatches support.refund_processor for a sub-threshold refund", async () => {
    const niato = createNiato({ packs: [supportPack] });
    const turn = await niato.run(
      "Please refund $15 on order ORD-99 — the item arrived damaged.",
    );

    const dispatches = extractAgentDispatches(turn.messages);
    expect(dispatches).toContain("support.refund_processor");
    expect(turn.classification.intent).toBe("refund_request");
    expect(turn.trace.outcome).toBe("success");
    // The result should reference a refund ID since the hook should NOT
    // have denied (amount < $20).
    expect(turn.result).toMatch(/RF-/);
  }, 180_000);

  it("denies a sub-threshold-violating refund via the dollar-limit hook", async () => {
    const niato = createNiato({ packs: [supportPack] });
    const turn = await niato.run(
      "I need a $250 refund on order ORD-9001 — it never arrived.",
    );

    expect(turn.classification.intent).toBe("refund_request");
    expect(turn.trace.outcome).toBe("success");
    // The deny reason "Refund of $250.00 requires human approval" surfaces
    // back to the orchestrator. Final response should mention escalation /
    // human approval rather than a refund ID. We don't strictly require
    // the orchestrator to re-dispatch to escalate (orchestrator behavior
    // depends on the model's read of the denial); we DO require that no
    // refund ID was issued.
    expect(turn.result).not.toMatch(/RF-[A-Z0-9]{8}/);
  }, 180_000);
});

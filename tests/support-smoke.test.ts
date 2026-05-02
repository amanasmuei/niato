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
//   3. refund at/above $20 → dollar-limit hook returns permissionDecision:
//      'ask'. Headless createNiato({...}) without `approval: channel`
//      wired receives Niato's built-in headlessDenyCanUseTool
//      (compose.ts), which auto-denies any 'ask' decision. The
//      resulting flow is: hook returns ask → SDK calls canUseTool →
//      built-in returns deny → tool is denied → orchestrator sees the
//      denial and adapts its plan. The visible outcome (no RF- ID
//      emitted) is identical to the prior explicit-deny posture.
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

  it("blocks a sub-threshold-violating refund via the dollar-limit hook", async () => {
    const niato = createNiato({ packs: [supportPack] });
    const turn = await niato.run(
      "I need a $250 refund on order ORD-9001 — it never arrived.",
    );

    expect(turn.classification.intent).toBe("refund_request");
    expect(turn.trace.outcome).toBe("success");
    // The hook now returns permissionDecision: 'ask' for amounts at/above
    // the threshold. Headless createNiato() above does not wire an
    // ApprovalChannel, so Niato's built-in headlessDenyCanUseTool
    // (compose.ts) auto-denies and the orchestrator sees the tool call
    // rejected. We don't strictly require the orchestrator to re-dispatch
    // to escalate (behavior depends on the model's read of the denial);
    // we DO require that no refund ID was issued.
    expect(turn.result).not.toMatch(/RF-[A-Z0-9]{8}/);
  }, 180_000);
});

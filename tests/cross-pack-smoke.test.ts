import { describe, expect, it } from "vitest";
import {
  createNiato,
  devToolsPack,
  extractAgentDispatches,
  genericPack,
  supportPack,
} from "../src/index.js";

// Phase 6 cross-pack composition smoke. One live turn against the
// architecture's textbook example (§7.4):
//
//   "the refund webhook is broken — find the bug and open a ticket for
//    the on-call engineer"
//
// Expected dispatch sequence:
//   1. dev_tools.bug_fixer  (produces the bug summary)
//   2. support.escalate     (consumes the summary, files the ticket)
//
// Sequential ordering matters here — the second specialist's input
// depends on the first's output. The orchestrator prompt explicitly
// names this as the canonical sequential case, so the smoke asserts
// the dispatch order, not just presence.
//
// Skipped without ANTHROPIC_API_KEY. Will fail with a 400 (budget) until
// 2026-05-01 — that's an environmental constraint, not a code regression.
const hasKey = Boolean(process.env["ANTHROPIC_API_KEY"]);

describe.skipIf(!hasKey)("smoke: cross-pack composition end-to-end", () => {
  it("dispatches dev_tools.bug_fixer → support.escalate for a refund-webhook bug + ticket request", async () => {
    const niato = createNiato({
      packs: [genericPack, supportPack, devToolsPack],
    });
    const turn = await niato.run(
      "The refund webhook is broken — find the bug and open a priority ticket for the on-call engineer.",
    );

    const dispatches = extractAgentDispatches(turn.messages);
    expect(dispatches).toContain("dev_tools.bug_fixer");
    expect(dispatches).toContain("support.escalate");

    const bugIdx = dispatches.indexOf("dev_tools.bug_fixer");
    const escalateIdx = dispatches.indexOf("support.escalate");
    expect(bugIdx).toBeLessThan(escalateIdx);

    expect(turn.classification.domain).toBe("dev_tools");
    expect(turn.classification.intent).toBe("fix_bug");
    expect(turn.classification.secondary?.length ?? 0).toBeGreaterThan(0);

    expect(turn.trace.outcome).toBe("success");
    expect(turn.trace.plan).toEqual(
      expect.arrayContaining(["dev_tools.bug_fixer", "support.escalate"]),
    );
  }, 300_000);
});

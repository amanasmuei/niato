import { describe, it, expect } from "vitest";
import {
  createNawaitu,
  genericPack,
  NawaituBudgetExceededError,
} from "../src/index.js";

// Phase 3 end-to-end check that the cost-limit gate sees real per-turn
// costs and rejects the next turn once the session ledger is exhausted.
// One real turn costs ~$0.03–0.05 against Haiku/Opus/Sonnet — set the
// limit deliberately tiny (0.0001 USD) so even the first turn blows past
// it, guaranteeing turn 2 is rejected at the gate.
const apiKey = process.env["ANTHROPIC_API_KEY"];

describe.skipIf(!apiKey)("cost-limit gate (E2E)", () => {
  it("rejects the next turn once cumulativeCostUsd ≥ costLimitUsd", async () => {
    const nawaitu = createNawaitu({
      packs: [genericPack],
      costLimitUsd: 0.0001,
    });

    const turn1 = await nawaitu.run("what is 2+2");
    expect(turn1.trace.outcome).toBe("success");
    // Real turns cost more than 0.0001 USD; the session ledger should now
    // be over the limit even though turn 1 itself ran (limit is checked at
    // turn-start, not mid-turn).
    expect(turn1.session.metrics.cumulativeCostUsd).toBeGreaterThan(0.0001);

    await expect(
      nawaitu.run("explain how DNS works", turn1.session.id),
    ).rejects.toThrow(NawaituBudgetExceededError);
  }, 180_000);
});

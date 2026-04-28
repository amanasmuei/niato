import { describe, expect, it } from "vitest";
import { createNawaitu, extractAgentDispatches, genericPack } from "../src/index.js";

// End-to-end smoke test. Hits the real Anthropic API (Haiku for the
// classifier, Opus for the orchestrator, Sonnet for the specialist) and
// only runs when ANTHROPIC_API_KEY is set.
const hasKey = Boolean(process.env["ANTHROPIC_API_KEY"]);

describe.skipIf(!hasKey)("smoke: end-to-end loop", () => {
  it("dispatches generic.retrieval for a question", async () => {
    const nawaitu = createNawaitu({ packs: [genericPack] });
    const turn = await nawaitu.run("what is 2+2");

    const dispatches = extractAgentDispatches(turn.messages);
    expect(dispatches, "expected at least one Agent dispatch").not.toHaveLength(
      0,
    );
    expect(dispatches).toContain("generic.retrieval");
    expect(turn.result).toBeTruthy();
    expect(turn.classification.domain).toBe("generic");
    expect(turn.classification.intent).toBe("question");
    expect(turn.classification.confidence).toBeGreaterThanOrEqual(0.85);
    expect(turn.trace.outcome).toBe("success");
    expect(turn.trace.plan).toContain("generic.retrieval");
  }, 120_000);
});

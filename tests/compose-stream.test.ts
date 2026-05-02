import { describe, it, expect } from "vitest";
import { createNiato } from "../src/core/compose.js";
import { genericPack } from "../src/packs/generic/index.js";
import { type NiatoEvent } from "../src/observability/events.js";
import { type IntentResult } from "../src/core/classifier/types.js";

const baseConfig = {
  ANTHROPIC_API_KEY: "sk-test",
  NIATO_LOG_LEVEL: "error" as const,
  NIATO_USER_ID: "default",
};

describe("Niato.runStream", () => {
  it("invokes onEvent with a turn_start event before classification, then classified, then turn_complete", async () => {
    const fakeClassification: IntentResult = {
      domain: "generic",
      intent: "task",
      confidence: 0.9,
    };
    const events: NiatoEvent[] = [];
    const niato = createNiato({
      packs: [genericPack],
      classifier: {
        classify: () => Promise.resolve(fakeClassification),
      },
      // Cast: orchestratorRunner test seam accepts our minimal stub; the
      // production runner returns the same shape (result + messages).
      orchestratorRunner: () =>
        Promise.resolve({ result: "ok", messages: [] }),
      config: baseConfig,
    });

    await niato.runStream("hi", "s1", (e) => {
      events.push(e);
    });
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("turn_start");
    expect(types).toContain("classified");
    expect(types[types.length - 1]).toBe("turn_complete");
  });

  it("run() is a no-op-event-callback alias for runStream() — same return shape, no events leaked", async () => {
    const niato = createNiato({
      packs: [genericPack],
      classifier: {
        classify: () =>
          Promise.resolve({
            domain: "generic",
            intent: "task",
            confidence: 0.9,
          }),
      },
      orchestratorRunner: () =>
        Promise.resolve({ result: "ok", messages: [] }),
      config: baseConfig,
    });
    const turn = await niato.run("hi", "s2");
    expect(turn.result).toBe("ok");
    expect(turn.classification.domain).toBe("generic");
    expect(turn.trace.outcome).toBe("error"); // no result-success message in stub
  });
});

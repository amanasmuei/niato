import { describe, it, expect } from "vitest";
import { createHaikuClassifier } from "../src/core/classifier/haiku.js";
import { genericPack } from "../src/index.js";
import { runGenericEvals } from "../src/packs/generic/evals/runEvals.js";

const apiKey = process.env["ANTHROPIC_API_KEY"];

describe.skipIf(!apiKey)("evals: Generic pack", () => {
  it("classifies at least 18/20 of the golden cases correctly", async () => {
    const classifier = createHaikuClassifier({
      packs: [genericPack],
      apiKey: apiKey ?? "",
    });

    const report = await runGenericEvals(classifier);

    if (report.passed < 18) {
      const failures = report.results.filter((r) => !r.passed);
      const summary = failures
        .map(
          (f) =>
            `  - ${JSON.stringify(f.case.input)} → expected ${f.case.expected.intent}, got ${f.actual.intent} (conf=${String(f.actual.confidence)})`,
        )
        .join("\n");
      throw new Error(
        `Eval pass rate ${String(report.passed)}/${String(report.total)} below threshold (18). Failures:\n${summary}`,
      );
    }

    expect(report.passed).toBeGreaterThanOrEqual(18);
    expect(report.total).toBe(20);
  }, 300_000);
});

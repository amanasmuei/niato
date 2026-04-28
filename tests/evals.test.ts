import { describe, it, expect } from "vitest";
import { createHaikuClassifier } from "../src/core/classifier/haiku.js";
import { devToolsPack, genericPack, supportPack } from "../src/index.js";
import { runGenericEvals } from "../src/packs/generic/evals/runEvals.js";
import { runSupportEvals } from "../src/packs/support/evals/runEvals.js";
import { runDevToolsEvals } from "../src/packs/dev-tools/evals/runEvals.js";
import {
  type EvalReport,
  type EvalCaseResult,
} from "../src/packs/generic/evals/runEvals.js";

const apiKey = process.env["ANTHROPIC_API_KEY"];

function summarizeFailures(failures: EvalCaseResult[]): string {
  return failures
    .map(
      (f) =>
        `  - ${JSON.stringify(f.case.input)} → expected ${f.case.expected.intent}, got ${f.actual.intent} (conf=${String(f.actual.confidence)})`,
    )
    .join("\n");
}

function assertEvalReport(
  report: EvalReport,
  threshold: number,
  expectedTotal: number,
): void {
  if (report.passed < threshold) {
    const failures = report.results.filter((r) => !r.passed);
    throw new Error(
      `Eval pass rate ${String(report.passed)}/${String(report.total)} below threshold (${String(threshold)}). Failures:\n${summarizeFailures(failures)}`,
    );
  }
  expect(report.passed).toBeGreaterThanOrEqual(threshold);
  expect(report.total).toBe(expectedTotal);
}

describe.skipIf(!apiKey)("evals: Generic pack", () => {
  it("classifies at least 18/20 of the golden cases correctly", async () => {
    const classifier = createHaikuClassifier({
      packs: [genericPack],
      apiKey: apiKey ?? "",
    });
    const report = await runGenericEvals(classifier);
    assertEvalReport(report, 18, 20);
  }, 300_000);
});

describe.skipIf(!apiKey)("evals: Support pack", () => {
  it("classifies at least 22/25 of the golden cases correctly", async () => {
    const classifier = createHaikuClassifier({
      packs: [supportPack],
      apiKey: apiKey ?? "",
    });
    const report = await runSupportEvals(classifier);
    assertEvalReport(report, 22, 25);
  }, 300_000);
});

describe.skipIf(!apiKey)("evals: Dev Tools pack", () => {
  it("classifies at least 22/25 of the golden cases correctly", async () => {
    const classifier = createHaikuClassifier({
      packs: [devToolsPack],
      apiKey: apiKey ?? "",
    });
    const report = await runDevToolsEvals(classifier);
    assertEvalReport(report, 22, 25);
  }, 300_000);
});

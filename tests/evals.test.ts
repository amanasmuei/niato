import { describe, it, expect } from "vitest";
import { createSonnetClassifier } from "../src/core/classifier/sonnet.js";
import { devToolsPack, genericPack, supportPack } from "../src/index.js";
import { runGenericEvals } from "../src/packs/generic/evals/runEvals.js";
import { runSupportEvals } from "../src/packs/support/evals/runEvals.js";
import { runDevToolsEvals } from "../src/packs/dev-tools/evals/runEvals.js";
import {
  type EvalReport,
  type EvalCaseResult,
} from "../src/packs/generic/evals/runEvals.js";

// E2E evals run when either ANTHROPIC_API_KEY is set OR Claude Code OAuth
// is available — the Agent SDK's `query()` resolves auth from either path.
// Today's heuristic: skip when no env var is set so test runs without a
// configured API key still pass offline. CI environments with OAuth-only
// auth can opt-in via `NAWAITU_LIVE_EVALS=1`.
const liveAuth =
  process.env["ANTHROPIC_API_KEY"] !== undefined ||
  process.env["NAWAITU_LIVE_EVALS"] === "1";

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

describe.skipIf(!liveAuth)("evals: Generic pack", () => {
  it("classifies at least 18/20 of the golden cases correctly", async () => {
    const classifier = createSonnetClassifier({ packs: [genericPack] });
    const report = await runGenericEvals(classifier);
    assertEvalReport(report, 18, 20);
  }, 300_000);
});

describe.skipIf(!liveAuth)("evals: Support pack", () => {
  it("classifies at least 22/25 of the golden cases correctly", async () => {
    const classifier = createSonnetClassifier({ packs: [supportPack] });
    const report = await runSupportEvals(classifier);
    assertEvalReport(report, 22, 25);
  }, 300_000);
});

describe.skipIf(!liveAuth)("evals: Dev Tools pack", () => {
  it("classifies at least 22/25 of the golden cases correctly", async () => {
    const classifier = createSonnetClassifier({ packs: [devToolsPack] });
    const report = await runDevToolsEvals(classifier);
    assertEvalReport(report, 22, 25);
  }, 300_000);
});

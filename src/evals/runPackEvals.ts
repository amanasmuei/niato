import { readFileSync } from "node:fs";
import { type Classifier } from "../core/classifier/types.js";

// Shared eval runner. Each pack ships a `cases.jsonl` and points the runner
// at it; the load + classify + score loop lives here once. Extracted from
// the per-pack copies once a third pack made the duplication a maintenance
// cost (per CLAUDE.md "three similar lines is better than a premature
// abstraction" — at three real call sites it isn't premature anymore).

export interface EvalCase {
  input: string;
  expected: { domain: string; intent: string };
  notes?: string;
}

export interface EvalCaseResult {
  case: EvalCase;
  actual: { domain: string; intent: string; confidence: number };
  passed: boolean;
  error?: string;
}

export interface EvalReport {
  total: number;
  passed: number;
  failed: number;
  results: EvalCaseResult[];
}

function loadCases(casesPath: string): EvalCase[] {
  return readFileSync(casesPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as EvalCase);
}

export async function runPackEvals(opts: {
  casesPath: string;
  classifier: Classifier;
}): Promise<EvalReport> {
  const cases = loadCases(opts.casesPath);
  const results: EvalCaseResult[] = [];
  for (const c of cases) {
    try {
      const actual = await opts.classifier.classify(c.input);
      const passed =
        actual.domain === c.expected.domain &&
        actual.intent === c.expected.intent;
      results.push({
        case: c,
        actual: {
          domain: actual.domain,
          intent: actual.intent,
          confidence: actual.confidence,
        },
        passed,
      });
    } catch (err) {
      // Classifier-level errors (SDK timeouts, max-turn caps, transient
      // network failures) are recorded as failed cases rather than
      // aborting the whole run. The eval suite is a quality signal — one
      // flaky case must not invalidate the other 19.
      results.push({
        case: c,
        actual: { domain: "", intent: "", confidence: 0 },
        passed: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const passed = results.filter((r) => r.passed).length;
  return {
    total: cases.length,
    passed,
    failed: cases.length - passed,
    results,
  };
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { type Classifier } from "../../../core/classifier/types.js";

// Phase 4: deliberate copy of Generic's runner targeting Support cases.
// Refactor into a shared helper deferred to Phase 5 once Dev Tools lands and
// the abstraction has two real call sites (per CLAUDE.md "three similar
// lines is better than a premature abstraction").

export interface EvalCase {
  input: string;
  expected: { domain: string; intent: string };
  notes?: string;
}

export interface EvalCaseResult {
  case: EvalCase;
  actual: { domain: string; intent: string; confidence: number };
  passed: boolean;
}

export interface EvalReport {
  total: number;
  passed: number;
  failed: number;
  results: EvalCaseResult[];
}

function loadCases(): EvalCase[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, "cases.jsonl"), "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as EvalCase);
}

export async function runSupportEvals(
  classifier: Classifier,
): Promise<EvalReport> {
  const cases = loadCases();
  const results: EvalCaseResult[] = [];
  for (const c of cases) {
    const actual = await classifier.classify(c.input);
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
  }
  const passed = results.filter((r) => r.passed).length;
  return {
    total: cases.length,
    passed,
    failed: cases.length - passed,
    results,
  };
}

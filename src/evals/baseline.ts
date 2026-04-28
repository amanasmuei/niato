import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { z } from "zod";
import { type EvalReport } from "./runPackEvals.js";

// Per-pack eval baseline. Stored at src/packs/<pack>/evals/baseline.json
// alongside cases.jsonl. The CLI runner uses it to catch regressions in
// classifier quality (e.g. a Haiku update that silently drops Support
// classification accuracy) without external alerting infrastructure —
// failing builds *are* the alert.

export const EvalBaselineSchema = z.object({
  passed: z.number().int().min(0),
  total: z.number().int().min(1),
  timestamp: z.string().min(1),
  notes: z.string().optional(),
});

export type EvalBaseline = z.infer<typeof EvalBaselineSchema>;

export function readBaseline(path: string): EvalBaseline | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  return EvalBaselineSchema.parse(parsed);
}

export function writeBaseline(path: string, report: EvalReport): EvalBaseline {
  const baseline: EvalBaseline = {
    passed: report.passed,
    total: report.total,
    timestamp: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  return baseline;
}

export interface BaselineCheck {
  ok: boolean;
  reason?: string;
}

// Strict regression check: any drop in `passed` count fails. `total` must
// match — a baseline written against a different cases.jsonl is invalid
// and should be regenerated explicitly with --write-baseline rather than
// silently passing.
export function checkAgainstBaseline(
  report: EvalReport,
  baseline: EvalBaseline,
): BaselineCheck {
  if (report.total !== baseline.total) {
    return {
      ok: false,
      reason: `case count changed: baseline ${String(baseline.total)} vs current ${String(report.total)}. Regenerate with --write-baseline if intentional.`,
    };
  }
  if (report.passed < baseline.passed) {
    return {
      ok: false,
      reason: `regression: ${String(report.passed)}/${String(report.total)} now vs ${String(baseline.passed)}/${String(baseline.total)} baseline (recorded ${baseline.timestamp}).`,
    };
  }
  return { ok: true };
}

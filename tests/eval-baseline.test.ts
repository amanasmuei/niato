import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkAgainstBaseline,
  readBaseline,
  writeBaseline,
  type EvalBaseline,
} from "../src/evals/baseline.js";
import { type EvalReport } from "../src/evals/runPackEvals.js";

function fakeReport(over: Partial<EvalReport> = {}): EvalReport {
  return {
    total: 25,
    passed: 23,
    failed: 2,
    results: [],
    ...over,
  };
}

let workDir: string;
let baselinePath: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "nawaitu-eval-baseline-"));
  baselinePath = join(workDir, "baseline.json");
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("readBaseline", () => {
  it("returns null when the file does not exist", () => {
    expect(readBaseline(baselinePath)).toBeNull();
  });

  it("parses a valid baseline file", () => {
    writeBaseline(baselinePath, fakeReport({ total: 25, passed: 23 }));
    const loaded = readBaseline(baselinePath);
    expect(loaded?.total).toBe(25);
    expect(loaded?.passed).toBe(23);
    expect(typeof loaded?.timestamp).toBe("string");
  });

  it("throws on a malformed baseline file (zod parse failure)", () => {
    writeFileSync(baselinePath, JSON.stringify({ passed: -1, total: 0 }));
    expect(() => readBaseline(baselinePath)).toThrow();
  });
});

describe("writeBaseline", () => {
  it("persists the report shape and stamps a timestamp", () => {
    const written = writeBaseline(
      baselinePath,
      fakeReport({ total: 20, passed: 19 }),
    );
    expect(written.passed).toBe(19);
    expect(written.total).toBe(20);
    expect(written.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const onDisk = JSON.parse(readFileSync(baselinePath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(onDisk["passed"]).toBe(19);
    expect(onDisk["total"]).toBe(20);
  });
});

describe("checkAgainstBaseline", () => {
  const baseline: EvalBaseline = {
    total: 25,
    passed: 23,
    timestamp: "2026-04-28T00:00:00.000Z",
  };

  it("passes when current score matches the baseline", () => {
    expect(
      checkAgainstBaseline(fakeReport({ total: 25, passed: 23 }), baseline).ok,
    ).toBe(true);
  });

  it("passes when the current score improves on the baseline", () => {
    expect(
      checkAgainstBaseline(fakeReport({ total: 25, passed: 25 }), baseline).ok,
    ).toBe(true);
  });

  it("fails when the current score regressed by even one case", () => {
    const result = checkAgainstBaseline(
      fakeReport({ total: 25, passed: 22 }),
      baseline,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/regression/);
    expect(result.reason).toContain("22/25");
    expect(result.reason).toContain("23/25");
  });

  it("fails when the case count changed (cases.jsonl edited without rewriting baseline)", () => {
    const result = checkAgainstBaseline(
      fakeReport({ total: 26, passed: 24 }),
      baseline,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/case count changed/);
    expect(result.reason).toMatch(/--write-baseline/);
  });
});

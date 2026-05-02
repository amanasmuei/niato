import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { History } from "../../../../src/cli/tui/screens/history.js";
import {
  type SessionStartLine,
  type SessionTurnLine,
} from "../../../../src/cli/tui/store/sessions.js";

const ARROW_DOWN = "[B";
const ARROW_UP = "[A";

function startLine(): SessionStartLine {
  return {
    v: 1,
    type: "session-start",
    mode: "casual",
    createdAt: "2026-04-30T12:00:00.000Z",
    companionVersion: 1,
  };
}

function turnLine(args: {
  ts: string;
  intent: string;
  domain: string;
  confidence: number;
  plan: string[];
  costUsd: number;
  latencyMs: number;
  outcome: "success" | "error";
  input?: string;
  output?: string;
  sessionId?: string;
}): SessionTurnLine {
  return {
    v: 1,
    type: "turn",
    input: args.input ?? "hello",
    output: args.output ?? "hi",
    classification: {
      intent: args.intent,
      domain: args.domain,
      confidence: args.confidence,
    },
    trace: {
      sessionId: args.sessionId ?? "ses-1",
      turnId: `turn-${args.ts}`,
      classification: {
        intent: args.intent,
        domain: args.domain,
        confidence: args.confidence,
      },
      plan: args.plan,
      specialists: args.plan.map((n) => ({ name: n, toolCalls: 0 })),
      tokensByModel: {},
      costUsd: args.costUsd,
      latencyMs: args.latencyMs,
      outcome: args.outcome,
      guardrailsTriggered: [],
    },
    ts: args.ts,
  };
}

function writeJsonl(
  dir: string,
  sessionId: string,
  lines: (SessionStartLine | SessionTurnLine)[],
): void {
  const file = join(dir, `${sessionId}.jsonl`);
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  writeFileSync(file, body);
}

describe("History screen", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "niato-history-"));
  });
  afterEach(() => {
    // Best-effort cleanup. If a test chmodded the dir to break reads,
    // restore perms before rm so the cleanup itself doesn't fail.
    try {
      chmodSync(dir, 0o700);
    } catch {
      /* ignore */
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("renders the empty state when no sessions exist", () => {
    const { lastFrame } = render(
      <History sessionsDir={dir} onBack={vi.fn()} />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("History");
    expect(out).toContain("No sessions recorded yet");
    expect(out).toMatch(/esc|back/i);
  });

  it("renders rows from a populated sessions directory", () => {
    writeJsonl(dir, "ses-1", [
      startLine(),
      turnLine({
        ts: "2026-04-30T12:01:00.000Z",
        intent: "fix_bug",
        domain: "dev_tools",
        confidence: 0.92,
        plan: ["bug_fixer"],
        costUsd: 0.0123,
        latencyMs: 1500,
        outcome: "success",
      }),
      turnLine({
        ts: "2026-04-30T12:02:00.000Z",
        intent: "complaint",
        domain: "support",
        confidence: 0.81,
        plan: ["responder", "ticket_creator"],
        costUsd: 0.0456,
        latencyMs: 2300,
        outcome: "error",
      }),
    ]);

    const { lastFrame } = render(
      <History sessionsDir={dir} onBack={vi.fn()} />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("History");
    expect(out).toContain("fix_bug");
    expect(out).toContain("dev_tools");
    expect(out).toContain("complaint");
    expect(out).toContain("support");
    expect(out).toContain("bug_fixer");
    expect(out).toContain("responder, ticket_creator");
    expect(out).toContain("$0.0123");
    expect(out).toContain("$0.0456");
    expect(out).toContain("1500ms");
    expect(out).toContain("2300ms");
    expect(out).toContain("✓");
    expect(out).toContain("✗");
    expect(out).toMatch(/esc|back/i);
    // 2 turns total
    expect(out).toMatch(/2\s*turns/);
  });

  it("moves the cursor down then up on arrow keys", async () => {
    writeJsonl(dir, "ses-1", [
      startLine(),
      // Most-recent first after sort: row 0 = b, row 1 = a
      turnLine({
        ts: "2026-04-30T12:01:00.000Z",
        intent: "alpha_intent",
        domain: "dev_tools",
        confidence: 0.9,
        plan: ["alpha_spec"],
        costUsd: 0.001,
        latencyMs: 100,
        outcome: "success",
      }),
      turnLine({
        ts: "2026-04-30T12:05:00.000Z",
        intent: "beta_intent",
        domain: "support",
        confidence: 0.9,
        plan: ["beta_spec"],
        costUsd: 0.002,
        latencyMs: 200,
        outcome: "success",
      }),
    ]);

    const { stdin, lastFrame } = render(
      <History sessionsDir={dir} onBack={vi.fn()} />,
    );

    // Initially the cursor sits on row 0 (most-recent = beta_intent).
    const initial = lastFrame() ?? "";
    expect(initial).toMatch(/▸\s*\S.*beta_intent/);

    stdin.write(ARROW_DOWN);
    await new Promise((r) => setImmediate(r));
    const afterDown = lastFrame() ?? "";
    expect(afterDown).toMatch(/▸\s*\S.*alpha_intent/);

    stdin.write(ARROW_UP);
    await new Promise((r) => setImmediate(r));
    const afterUp = lastFrame() ?? "";
    expect(afterUp).toMatch(/▸\s*\S.*beta_intent/);
  });

  it("shows back hint in populated state", () => {
    writeJsonl(dir, "ses-1", [
      startLine(),
      turnLine({
        ts: "2026-04-30T12:01:00.000Z",
        intent: "x",
        domain: "y",
        confidence: 0.5,
        plan: [],
        costUsd: 0,
        latencyMs: 1,
        outcome: "success",
      }),
    ]);
    const { lastFrame } = render(
      <History sessionsDir={dir} onBack={vi.fn()} />,
    );
    const out = lastFrame() ?? "";
    expect(out).toMatch(/esc/i);
    expect(out).toMatch(/back/i);
  });

  it("renders a friendly error when the sessions path cannot be read", () => {
    // Point sessionsDir at a regular file instead of a directory — the
    // resulting ENOTDIR from readdirSync exercises the screen's catch path
    // without needing to spy on a frozen ESM namespace.
    const filePath = join(dir, "not-a-dir.txt");
    writeFileSync(filePath, "decoy");
    const { lastFrame } = render(
      <History sessionsDir={filePath} onBack={vi.fn()} />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("History");
    expect(out).toMatch(/could not load history/i);
    expect(out).toMatch(/esc|back/i);
  });
});

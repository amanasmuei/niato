import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendSessionStart,
  appendTurn,
  appendError,
  loadSession,
  loadMostRecent,
  listRecentSessions,
  pruneSessions,
  type LoadedSession,
} from "../../../../src/cli/tui/store/sessions.js";
import { type TurnRecord } from "../../../../src/observability/trace.js";

const fakeTrace = (): TurnRecord => ({
  sessionId: "s1",
  turnId: "t1",
  classification: { domain: "generic", intent: "explain", confidence: 0.9 },
  plan: ["generic.explain"],
  specialists: [{ name: "generic.explain", toolCalls: 0 }],
  costUsd: 0.001,
  latencyMs: 1234,
  tokensByModel: {},
  outcome: "success",
  guardrailsTriggered: [],
});

function expectLoaded(session: LoadedSession | null): LoadedSession {
  if (session === null) throw new Error("expected a loaded session, got null");
  return session;
}

describe("session store", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "niato-test-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a session start + turns via JSONL", () => {
    appendSessionStart("s1", "casual", 1, dir);
    appendTurn("s1", "hello", "world", fakeTrace(), undefined, dir);
    appendTurn("s1", "again", "again-out", fakeTrace(), undefined, dir);

    const loaded = expectLoaded(loadSession("s1", dir));
    expect(loaded.mode).toBe("casual");
    expect(loaded.turns).toHaveLength(2);
    expect(loaded.turns[0]?.input).toBe("hello");
    const second = loaded.turns[1];
    if (second?.type === "turn") {
      expect(second.output).toBe("again-out");
    } else {
      throw new Error("expected second line to be a turn");
    }
  });

  it("returns null for missing session", () => {
    expect(loadSession("nope", dir)).toBeNull();
  });

  it("skips corrupt lines without crashing", () => {
    appendSessionStart("s1", "casual", 1, dir);
    writeFileSync(join(dir, "s1.jsonl"), "not-json\n", { flag: "a" });
    appendTurn("s1", "ok", "ok-out", fakeTrace(), undefined, dir);

    const loaded = expectLoaded(loadSession("s1", dir));
    expect(loaded.turns).toHaveLength(1);
    expect(loaded.turns[0]?.input).toBe("ok");
  });

  it("listRecent + loadMostRecent order by mtime desc", async () => {
    appendSessionStart("old", "casual", 1, dir);
    await new Promise((r) => setTimeout(r, 10));
    appendSessionStart("new", "dev", 1, dir);

    const list = listRecentSessions(dir);
    expect(list[0]?.sessionId).toBe("new");
    const recent = expectLoaded(loadMostRecent(dir));
    expect(recent.sessionId).toBe("new");
  });

  it("round-trips error lines", () => {
    appendSessionStart("s1", "casual", 1, dir);
    appendTurn("s1", "good q", "good a", fakeTrace(), undefined, dir);
    appendError("s1", "bad q", "boom", dir);

    const loaded = expectLoaded(loadSession("s1", dir));
    expect(loaded.turns).toHaveLength(2);
    expect(loaded.turns[0]?.type).toBe("turn");
    expect(loaded.turns[1]?.type).toBe("error");
    if (loaded.turns[1]?.type === "error") {
      expect(loaded.turns[1].input).toBe("bad q");
      expect(loaded.turns[1].errorMessage).toBe("boom");
    }
  });

  it("prune deletes everything past maxKeep", () => {
    for (let i = 0; i < 5; i++) appendSessionStart(`s${String(i)}`, "casual", 1, dir);
    const removed = pruneSessions(2, dir);
    expect(removed).toBe(3);
    expect(listRecentSessions(dir)).toHaveLength(2);
    expect(existsSync(join(dir, "s0.jsonl"))).toBe(false);
  });
});

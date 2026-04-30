import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import { App } from "../../src/cli/tui/app.js";
import { type Companion } from "../../src/cli/companion-config.js";
import { makeStubNiato } from "./tui/_helpers/stub-niato.js";
import { expectDefined } from "./tui/_helpers/expect-defined.js";

// End-to-end smoke test that exercises the full launcher → mode-prompt →
// session → JSONL flow with the stub Niato (no real Anthropic calls).
//
// Note on file extension: this is `.test.tsx` (not `.ts` per the plan
// literal) because the test renders JSX (`<App ...>`). Vitest's include
// glob accepts both extensions.
describe("TUI end-to-end smoke", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "niato-smoke-"));
    mkdirSync(join(root, "sessions"), { recursive: true });
    const companion: Companion = {
      version: 1,
      name: "Arienz",
      voice: "warm",
      createdAt: "2026-04-28T00:00:00Z",
    };
    writeFileSync(join(root, "companion.json"), `${JSON.stringify(companion)}\n`);
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("launcher → New session → submit one turn → see output → JSONL written", async () => {
    const { stdin, lastFrame, rerender } = render(
      <App
        companionPath={join(root, "companion.json")}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        niatoFactory={() => makeStubNiato([{ output: "the answer is 42" }])}
        version="0.0.0-smoke"
      />,
    );

    // launcher visible
    expect(lastFrame()).toContain("New session");

    // hit enter on the first item (New session) → opens mode-prompt
    stdin.write("\r");
    rerender(
      <App
        companionPath={join(root, "companion.json")}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        niatoFactory={() => makeStubNiato([{ output: "the answer is 42" }])}
        version="0.0.0-smoke"
      />,
    );
    expect(lastFrame()).toContain("Mode for this session?");

    // hit enter on the first item (Casual) → opens session
    stdin.write("\r");
    rerender(
      <App
        companionPath={join(root, "companion.json")}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        niatoFactory={() => makeStubNiato([{ output: "the answer is 42" }])}
        version="0.0.0-smoke"
      />,
    );
    expect(lastFrame()).toMatch(/casual|session/);

    // type a message and submit. Yield via setImmediate between the keys
    // and the \r so the TextInput's onChange flushes setDraft(...) before
    // the Enter key fires; otherwise the closed-over `value` is still ""
    // and the trim() guard in Session.onSubmit swallows it.
    stdin.write("what is the answer?");
    await new Promise((r) => setImmediate(r));
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 50));
    rerender(
      <App
        companionPath={join(root, "companion.json")}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        niatoFactory={() => makeStubNiato([{ output: "the answer is 42" }])}
        version="0.0.0-smoke"
      />,
    );

    expect(lastFrame()).toContain("the answer is 42");

    // a JSONL file should now exist
    const sessions = readdirSync(join(root, "sessions"));
    expect(sessions.length).toBe(1);
    const sessionFile = expectDefined(sessions[0], "no session file written");
    const file = join(root, "sessions", sessionFile);
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    // session-start + 1 turn
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const turnRaw = expectDefined(lines[1], "missing turn line");
    // JSON.parse returns `unknown`; runtime-narrow before reading fields.
    // The `in` checks below narrow the type structurally, so no cast is
    // needed (project ESLint flags unnecessary assertions).
    const turnLine: unknown = JSON.parse(turnRaw);
    if (
      typeof turnLine !== "object" ||
      turnLine === null ||
      !("input" in turnLine) ||
      !("output" in turnLine)
    ) {
      throw new Error("turn line missing input/output fields");
    }
    expect(turnLine.input).toBe("what is the answer?");
    expect(turnLine.output).toBe("the answer is 42");
    expect(existsSync(file)).toBe(true);
  });
});

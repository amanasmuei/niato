import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import { Session } from "../../../../src/cli/tui/screens/session.js";
import { type Companion } from "../../../../src/cli/companion-config.js";
import { type TurnState } from "../../../../src/cli/tui/hooks/use-nawaitu-session.js";
import { makeStubNawaitu } from "../_helpers/stub-nawaitu.js";

const companion: Companion = {
  version: 1,
  name: "Arienz",
  voice: "warm",
  createdAt: "2026-04-28T00:00:00Z",
};

describe("Session screen", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nawaitu-session-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("submits a turn and writes it to the JSONL file", async () => {
    const { stdin, lastFrame, rerender } = render(
      <Session
        companion={companion}
        mode="casual"
        sessionId="ses-1"
        sessionsDir={dir}
        nawaituFactory={() => makeStubNawaitu([{ output: "hi back" }])}
        replayedTurns={[]}
        onExit={() => undefined}
      />,
    );

    stdin.write("hi");
    // let onChange flush so setDraft("hi") applies before we send Enter —
    // otherwise the TextInput's useInput closure submits the still-empty
    // value and the trim() guard swallows the empty submit.
    await new Promise((r) => setImmediate(r));
    stdin.write("\r");

    // wait for async run() to resolve and for the post-turn rerender
    await new Promise((r) => setTimeout(r, 30));
    rerender(
      <Session
        companion={companion}
        mode="casual"
        sessionId="ses-1"
        sessionsDir={dir}
        nawaituFactory={() => makeStubNawaitu([{ output: "hi back" }])}
        replayedTurns={[]}
        onExit={() => undefined}
      />,
    );

    expect(lastFrame()).toContain("hi back");

    const file = join(dir, "ses-1.jsonl");
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2); // session-start + at least 1 turn
  });

  it("renders replayed turns from a resumed session", () => {
    const replayed: TurnState[] = [
      {
        input: "earlier q",
        output: "earlier a",
        classification: undefined,
        trace: undefined,
        errorMessage: undefined,
        phase: "done",
      },
    ];
    const { lastFrame } = render(
      <Session
        companion={companion}
        mode="casual"
        sessionId="ses-2"
        sessionsDir={dir}
        nawaituFactory={() => makeStubNawaitu([])}
        replayedTurns={replayed}
        onExit={() => undefined}
      />,
    );
    expect(lastFrame()).toContain("earlier q");
    expect(lastFrame()).toContain("earlier a");
  });
});

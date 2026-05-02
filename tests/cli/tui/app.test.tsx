import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as flush } from "node:timers/promises";
import React from "react";
import { render } from "ink-testing-library";
import { App } from "../../../src/cli/tui/app.js";
import { type Companion } from "../../../src/cli/companion-config.js";
import { makeStubNiato } from "./_helpers/stub-niato.js";

const companion: Companion = {
  version: 1,
  name: "Arienz",
  voice: "warm",
  createdAt: "2026-04-28T00:00:00Z",
};

function setupCompanionFile(dir: string): string {
  const p = join(dir, "companion.json");
  writeFileSync(p, `${JSON.stringify(companion, null, 2)}\n`);
  return p;
}

const ARROW_DOWN = "\x1B[B";
const ENTER = "\r";

describe("App shell", () => {
  let root: string;
  let savedApiKey: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "niato-app-"));
    mkdirSync(join(root, "sessions"), { recursive: true });
    savedApiKey = process.env["ANTHROPIC_API_KEY"];
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    if (savedApiKey === undefined) {
      delete process.env["ANTHROPIC_API_KEY"];
    } else {
      process.env["ANTHROPIC_API_KEY"] = savedApiKey;
    }
  });

  function writeAuthFile(dir: string, contents: unknown): string {
    const p = join(dir, "auth.json");
    writeFileSync(p, JSON.stringify(contents));
    return p;
  }

  it("companion + auth present → opens on launcher", () => {
    const companionPath = setupCompanionFile(root);
    const authPath = writeAuthFile(root, { mode: "subscription" });
    const { lastFrame } = render(
      <App
        companionPath={companionPath}
        sessionsDir={join(root, "sessions")}
        authPath={authPath}
        niatoFactory={() => makeStubNiato([])}
        version="0.0.0-test"
      />,
    );
    expect(lastFrame()).toContain("New session");
  });

  it("companion present but auth missing → opens on first-run (the niato login bug fix)", () => {
    // Repro of the bug aman hit: ran `niato login` (which historically did
    // not write auth.json), then `niato`. App opened on launcher → user
    // resumed last session → render-time throw inside useNiatoSession
    // because resolveAuthMode found no env vars. With auth gating, the App
    // routes to first-run instead, never letting Session mount without
    // auth.
    const companionPath = setupCompanionFile(root);
    const { lastFrame } = render(
      <App
        companionPath={companionPath}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        niatoFactory={() => makeStubNiato([])}
        version="0.0.0-test"
      />,
    );
    expect(lastFrame()).toContain("Welcome to Niato");
  });

  it("companion missing → opens on first-run", () => {
    const { lastFrame } = render(
      <App
        companionPath={join(root, "missing.json")}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        niatoFactory={() => makeStubNiato([])}
        version="0.0.0-test"
      />,
    );
    expect(lastFrame()).toContain("Welcome to Niato");
  });

  it("first-run → api-key entry → companion wizard → launcher", async () => {
    // No companion file, no env var — fresh install path.
    delete process.env["ANTHROPIC_API_KEY"];

    const { stdin, lastFrame } = render(
      <App
        companionPath={join(root, "missing-companion.json")}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        niatoFactory={() => makeStubNiato([])}
        version="0.3.0-test"
      />,
    );
    await flush();

    // first-run shown — pick API key (item 2: arrow down, enter)
    expect(lastFrame() ?? "").toContain("Welcome to Niato");
    stdin.write(ARROW_DOWN); // ↓ to api-key item
    await flush();
    stdin.write(ENTER); // pick api-key
    await flush();

    // api-key entry shown
    expect(lastFrame() ?? "").toContain("API key");
    stdin.write("sk-ant-test123");
    await flush();
    stdin.write(ENTER);
    await flush();

    // companion wizard step 1 — name
    expect(lastFrame() ?? "").toMatch(/companion name|step 1/i);
    stdin.write("Layla");
    await flush();
    stdin.write(ENTER);
    await flush();

    // step 2: userName — skip
    stdin.write(ENTER);
    await flush();

    // step 3: voice menu — Enter picks first ("warm")
    stdin.write(ENTER);
    await flush();

    // step 4: extraDescription — skip
    stdin.write(ENTER);
    await flush();

    // launcher reached
    expect(lastFrame() ?? "").toMatch(/Layla|New session/i);
  });
});

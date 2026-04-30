import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as flush } from "node:timers/promises";
import React from "react";
import { render } from "ink-testing-library";
import { App } from "../../../src/cli/tui/app.js";
import { type Companion } from "../../../src/cli/companion-config.js";
import { makeStubNawaitu } from "./_helpers/stub-nawaitu.js";

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
    root = mkdtempSync(join(tmpdir(), "nawaitu-app-"));
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

  it("companion present → opens on launcher", () => {
    const companionPath = setupCompanionFile(root);
    const { lastFrame } = render(
      <App
        companionPath={companionPath}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        nawaituFactory={() => makeStubNawaitu([])}
        version="0.0.0-test"
      />,
    );
    expect(lastFrame()).toContain("New session");
  });

  it("companion missing → opens on first-run", () => {
    const { lastFrame } = render(
      <App
        companionPath={join(root, "missing.json")}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        nawaituFactory={() => makeStubNawaitu([])}
        version="0.0.0-test"
      />,
    );
    expect(lastFrame()).toContain("Welcome to Nawaitu");
  });

  it("first-run → api-key entry → companion wizard → launcher", async () => {
    // No companion file, no env var — fresh install path.
    delete process.env["ANTHROPIC_API_KEY"];

    const { stdin, lastFrame } = render(
      <App
        companionPath={join(root, "missing-companion.json")}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        nawaituFactory={() => makeStubNawaitu([])}
        version="0.3.0-test"
      />,
    );
    await flush();

    // first-run shown — pick API key (item 2: arrow down, enter)
    expect(lastFrame() ?? "").toContain("Welcome to Nawaitu");
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

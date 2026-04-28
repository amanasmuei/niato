import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

describe("App shell", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nawaitu-app-"));
    mkdirSync(join(root, "sessions"), { recursive: true });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
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
});

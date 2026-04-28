import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadCompanion,
  saveCompanion,
  type Companion,
} from "../src/cli/companion-config.js";

let workDir: string;
let configPath: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "nawaitu-companion-"));
  configPath = join(workDir, ".nawaitu", "companion.json");
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const sample: Companion = {
  version: 1,
  name: "Layla",
  userName: "Aman",
  voice: "warm",
  extraDescription: "Faith-aware, walks alongside not above.",
  createdAt: "2026-04-28T00:00:00.000Z",
};

describe("loadCompanion", () => {
  it("returns null when the file does not exist", () => {
    expect(loadCompanion(configPath)).toBeNull();
  });

  it("creates parent directory and roundtrips a saved companion", () => {
    saveCompanion(sample, configPath);
    expect(loadCompanion(configPath)).toEqual(sample);
  });

  it("returns null on a malformed JSON file (does not throw)", () => {
    saveCompanion(sample, configPath); // creates parent dir
    writeFileSync(configPath, "{ not valid json");
    expect(loadCompanion(configPath)).toBeNull();
  });

  it("returns null on a JSON file that fails the schema (e.g. unknown voice)", () => {
    saveCompanion(sample, configPath);
    writeFileSync(
      configPath,
      JSON.stringify({ ...sample, voice: "shouty" }),
    );
    expect(loadCompanion(configPath)).toBeNull();
  });

  it("loads a minimal companion (no userName / no extraDescription)", () => {
    const minimal: Companion = {
      version: 1,
      name: "Sage",
      voice: "direct",
      createdAt: "2026-04-28T00:00:00.000Z",
    };
    saveCompanion(minimal, configPath);
    expect(loadCompanion(configPath)).toEqual(minimal);
  });
});

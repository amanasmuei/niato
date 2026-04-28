import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync as fsWriteFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadAuth,
  saveAuth,
  resolveAuth,
} from "../../../../src/cli/tui/store/auth.js";

describe("auth store", () => {
  let dir: string;
  let path: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nawaitu-auth-"));
    path = join(dir, "auth.json");
    originalEnv = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalEnv !== undefined) process.env["ANTHROPIC_API_KEY"] = originalEnv;
    else delete process.env["ANTHROPIC_API_KEY"];
  });

  it("returns null when no auth source available", () => {
    expect(resolveAuth(path)).toBeNull();
  });

  it("env var beats file", () => {
    saveAuth({ mode: "api-key", apiKey: "from-file" }, path);
    process.env["ANTHROPIC_API_KEY"] = "from-env";
    const r = resolveAuth(path);
    expect(r?.mode).toBe("api-key");
    if (r?.mode === "api-key") expect(r.apiKey).toBe("from-env");
  });

  it("falls back to file when no env", () => {
    saveAuth({ mode: "subscription" }, path);
    expect(resolveAuth(path)?.mode).toBe("subscription");
  });

  it("save chmods the file to 600", () => {
    saveAuth({ mode: "api-key", apiKey: "k" }, path);
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("load returns null on malformed file", () => {
    // saved file with bad JSON
    saveAuth({ mode: "api-key", apiKey: "k" }, path);
    // Overwrite with garbage
    fsWriteFileSync(path, "not-json");
    expect(loadAuth(path)).toBeNull();
  });

  it("rejects api-key record with missing apiKey as malformed", () => {
    fsWriteFileSync(path, JSON.stringify({ mode: "api-key" }));
    expect(loadAuth(path)).toBeNull();
  });

  it("rejects records with unknown mode value as malformed", () => {
    fsWriteFileSync(path, JSON.stringify({ mode: "hacked" }));
    expect(loadAuth(path)).toBeNull();
  });
});

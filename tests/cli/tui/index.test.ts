import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPersistedAuthEnv } from "../../../src/cli/tui/auth-env.js";

describe("applyPersistedAuthEnv", () => {
  let tmpDir: string;
  let authPath: string;
  let originalNawaituAuth: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "nawaitu-auth-env-"));
    authPath = join(tmpDir, "auth.json");
    originalNawaituAuth = process.env["NAWAITU_AUTH"];
    delete process.env["NAWAITU_AUTH"];
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    if (originalNawaituAuth === undefined) delete process.env["NAWAITU_AUTH"];
    else process.env["NAWAITU_AUTH"] = originalNawaituAuth;
  });

  it("sets NAWAITU_AUTH=subscription when persisted auth.json picks subscription", () => {
    writeFileSync(authPath, JSON.stringify({ mode: "subscription" }));
    applyPersistedAuthEnv(authPath);
    expect(process.env["NAWAITU_AUTH"]).toBe("subscription");
  });

  it("does not set NAWAITU_AUTH when persisted auth.json picks api-key", () => {
    writeFileSync(
      authPath,
      JSON.stringify({ mode: "api-key", apiKey: "sk-test" }),
    );
    applyPersistedAuthEnv(authPath);
    expect(process.env["NAWAITU_AUTH"]).toBeUndefined();
  });

  it("does not overwrite an existing NAWAITU_AUTH env value", () => {
    process.env["NAWAITU_AUTH"] = "subscription";
    writeFileSync(
      authPath,
      JSON.stringify({ mode: "api-key", apiKey: "sk-test" }),
    );
    applyPersistedAuthEnv(authPath);
    expect(process.env["NAWAITU_AUTH"]).toBe("subscription");
  });

  it("is a no-op when auth.json is missing", () => {
    applyPersistedAuthEnv(authPath);
    expect(process.env["NAWAITU_AUTH"]).toBeUndefined();
  });

  it("is a no-op when auth.json is malformed", () => {
    writeFileSync(authPath, "{not json");
    applyPersistedAuthEnv(authPath);
    expect(process.env["NAWAITU_AUTH"]).toBeUndefined();
  });
});

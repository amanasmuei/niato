import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPersistedAuthEnv } from "../../../src/cli/tui/auth-env.js";

describe("applyPersistedAuthEnv", () => {
  let tmpDir: string;
  let authPath: string;
  let originalNiatoAuth: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "niato-auth-env-"));
    authPath = join(tmpDir, "auth.json");
    originalNiatoAuth = process.env["NIATO_AUTH"];
    delete process.env["NIATO_AUTH"];
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    if (originalNiatoAuth === undefined) delete process.env["NIATO_AUTH"];
    else process.env["NIATO_AUTH"] = originalNiatoAuth;
  });

  it("sets NIATO_AUTH=subscription when persisted auth.json picks subscription", () => {
    writeFileSync(authPath, JSON.stringify({ mode: "subscription" }));
    applyPersistedAuthEnv(authPath);
    expect(process.env["NIATO_AUTH"]).toBe("subscription");
  });

  it("does not set NIATO_AUTH when persisted auth.json picks api-key", () => {
    writeFileSync(
      authPath,
      JSON.stringify({ mode: "api-key", apiKey: "sk-test" }),
    );
    applyPersistedAuthEnv(authPath);
    expect(process.env["NIATO_AUTH"]).toBeUndefined();
  });

  it("does not overwrite an existing NIATO_AUTH env value", () => {
    process.env["NIATO_AUTH"] = "subscription";
    writeFileSync(
      authPath,
      JSON.stringify({ mode: "api-key", apiKey: "sk-test" }),
    );
    applyPersistedAuthEnv(authPath);
    expect(process.env["NIATO_AUTH"]).toBe("subscription");
  });

  it("is a no-op when auth.json is missing", () => {
    applyPersistedAuthEnv(authPath);
    expect(process.env["NIATO_AUTH"]).toBeUndefined();
  });

  it("is a no-op when auth.json is malformed", () => {
    writeFileSync(authPath, "{not json");
    applyPersistedAuthEnv(authPath);
    expect(process.env["NIATO_AUTH"]).toBeUndefined();
  });

  it("treats empty NIATO_AUTH as unset and falls back to persisted choice", () => {
    process.env["NIATO_AUTH"] = "";
    writeFileSync(authPath, JSON.stringify({ mode: "subscription" }));
    applyPersistedAuthEnv(authPath);
    expect(process.env["NIATO_AUTH"]).toBe("subscription");
  });
});

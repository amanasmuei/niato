import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPersistedAuthEnv } from "../../../src/cli/tui/auth-env.js";

describe("applyPersistedAuthEnv", () => {
  let tmpDir: string;
  let authPath: string;
  let originalNiatoAuth: string | undefined;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "niato-auth-env-"));
    authPath = join(tmpDir, "auth.json");
    originalNiatoAuth = process.env["NIATO_AUTH"];
    originalApiKey = process.env["ANTHROPIC_API_KEY"];
    delete process.env["NIATO_AUTH"];
    delete process.env["ANTHROPIC_API_KEY"];
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    if (originalNiatoAuth === undefined) delete process.env["NIATO_AUTH"];
    else process.env["NIATO_AUTH"] = originalNiatoAuth;
    if (originalApiKey === undefined) delete process.env["ANTHROPIC_API_KEY"];
    else process.env["ANTHROPIC_API_KEY"] = originalApiKey;
  });

  describe("subscription path", () => {
    it("sets NIATO_AUTH=subscription when persisted auth.json picks subscription", () => {
      writeFileSync(authPath, JSON.stringify({ mode: "subscription" }));
      applyPersistedAuthEnv(authPath);
      expect(process.env["NIATO_AUTH"]).toBe("subscription");
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

    it("treats empty NIATO_AUTH as unset and falls back to persisted choice", () => {
      process.env["NIATO_AUTH"] = "";
      writeFileSync(authPath, JSON.stringify({ mode: "subscription" }));
      applyPersistedAuthEnv(authPath);
      expect(process.env["NIATO_AUTH"]).toBe("subscription");
    });
  });

  describe("api-key path (v1.2.1 bridge fix)", () => {
    // Closes the latent bug from v1.2.0: in-app api-key entry saved the
    // file but never bridged to ANTHROPIC_API_KEY. Next launch's
    // applyPersistedAuthEnv ignored api-key mode entirely, so resolveAuthMode
    // threw "no auth configured" even though the user had completed setup.
    it("sets ANTHROPIC_API_KEY when persisted auth.json picks api-key", () => {
      writeFileSync(
        authPath,
        JSON.stringify({ mode: "api-key", apiKey: "sk-test-bridge" }),
      );
      applyPersistedAuthEnv(authPath);
      expect(process.env["ANTHROPIC_API_KEY"]).toBe("sk-test-bridge");
    });

    it("does not overwrite an existing ANTHROPIC_API_KEY env value", () => {
      process.env["ANTHROPIC_API_KEY"] = "sk-shell-wins";
      writeFileSync(
        authPath,
        JSON.stringify({ mode: "api-key", apiKey: "sk-file-loses" }),
      );
      applyPersistedAuthEnv(authPath);
      expect(process.env["ANTHROPIC_API_KEY"]).toBe("sk-shell-wins");
    });

    it("does not set NIATO_AUTH when persisted auth.json picks api-key", () => {
      writeFileSync(
        authPath,
        JSON.stringify({ mode: "api-key", apiKey: "sk-test" }),
      );
      applyPersistedAuthEnv(authPath);
      expect(process.env["NIATO_AUTH"]).toBeUndefined();
    });

    it("treats empty ANTHROPIC_API_KEY as unset and falls back to file", () => {
      process.env["ANTHROPIC_API_KEY"] = "";
      writeFileSync(
        authPath,
        JSON.stringify({ mode: "api-key", apiKey: "sk-from-file" }),
      );
      applyPersistedAuthEnv(authPath);
      expect(process.env["ANTHROPIC_API_KEY"]).toBe("sk-from-file");
    });
  });

  describe("no-op cases", () => {
    it("is a no-op when auth.json is missing", () => {
      applyPersistedAuthEnv(authPath);
      expect(process.env["NIATO_AUTH"]).toBeUndefined();
      expect(process.env["ANTHROPIC_API_KEY"]).toBeUndefined();
    });

    it("is a no-op when auth.json is malformed", () => {
      writeFileSync(authPath, "{not json");
      applyPersistedAuthEnv(authPath);
      expect(process.env["NIATO_AUTH"]).toBeUndefined();
      expect(process.env["ANTHROPIC_API_KEY"]).toBeUndefined();
    });
  });
});

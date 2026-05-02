import { describe, it, expect, beforeEach } from "vitest";
import {
  runSetupToken,
  type SetupTokenIO,
  type SetupTokenResult,
} from "../../src/cli/setup-token.js";

interface RecordedIO {
  io: SetupTokenIO;
  logs: string[];
  errs: string[];
}

function makeIO(opts: {
  exitCode?: number;
  spawnError?: Error;
}): RecordedIO {
  const logs: string[] = [];
  const errs: string[] = [];
  const io: SetupTokenIO = {
    runClaudeSetupToken: () => {
      if (opts.spawnError !== undefined) return Promise.reject(opts.spawnError);
      return Promise.resolve(opts.exitCode ?? 0);
    },
    log: (line) => {
      logs.push(line);
    },
    err: (line) => {
      errs.push(line);
    },
  };
  return { io, logs, errs };
}

describe("runSetupToken", () => {
  let recorded: RecordedIO;

  describe("on successful claude setup-token (exit 0)", () => {
    let result: SetupTokenResult;
    beforeEach(async () => {
      recorded = makeIO({ exitCode: 0 });
      result = await runSetupToken(recorded.io);
    });

    it("returns ok=true", () => {
      expect(result).toEqual({ ok: true, exitCode: 0 });
    });

    it("tells the user to export the token and run niato", () => {
      const all = recorded.logs.join("\n");
      expect(all).toContain("CLAUDE_CODE_OAUTH_TOKEN");
      expect(all).toContain("niato");
    });

    it("does NOT prompt for or persist the token (Anthropic policy: copy, don't save)", () => {
      // Defensive: niato.setup-token must be a thin wrapper. The output
      // tells users WHAT to do; it never reads the token from stdout, never
      // writes it anywhere. If this changes, the test should fail loudly.
      const all = [...recorded.logs, ...recorded.errs].join("\n");
      expect(all).not.toMatch(/save.*token|writing.*token|stored.*token/i);
    });
  });

  describe("when claude setup-token exits non-zero", () => {
    it("returns ok=false carrying the exit code", async () => {
      recorded = makeIO({ exitCode: 5 });
      const result = await runSetupToken(recorded.io);
      expect(result).toEqual({ ok: false, exitCode: 5 });
    });
  });

  describe("when `claude` is not installed (ENOENT)", () => {
    let result: SetupTokenResult;
    beforeEach(async () => {
      const enoent = Object.assign(new Error("spawn claude ENOENT"), {
        code: "ENOENT",
      });
      recorded = makeIO({ spawnError: enoent });
      result = await runSetupToken(recorded.io);
    });

    it("returns ok=false without throwing", () => {
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it("points the user at the Claude Code install URL", () => {
      const all = recorded.errs.join("\n");
      expect(all).toContain("docs.claude.com");
    });
  });

  describe("on unexpected spawn error", () => {
    it("propagates the error to the caller", async () => {
      recorded = makeIO({ spawnError: new Error("boom") });
      await expect(runSetupToken(recorded.io)).rejects.toThrow("boom");
    });
  });
});

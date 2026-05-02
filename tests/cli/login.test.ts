import { describe, it, expect, beforeEach } from "vitest";
import { runLogin, type LoginIO, type LoginResult } from "../../src/cli/login.js";

interface RecordedIO {
  io: LoginIO;
  logs: string[];
  errs: string[];
  saveCalls: (string | undefined)[];
}

function makeIO(opts: {
  exitCode?: number;
  spawnError?: Error;
}): RecordedIO {
  const logs: string[] = [];
  const errs: string[] = [];
  const saveCalls: (string | undefined)[] = [];
  const io: LoginIO = {
    runClaudeLogin: () => {
      if (opts.spawnError !== undefined) {
        return Promise.reject(opts.spawnError);
      }
      return Promise.resolve(opts.exitCode ?? 0);
    },
    saveAuth: (path) => {
      saveCalls.push(path);
    },
    log: (line) => {
      logs.push(line);
    },
    err: (line) => {
      errs.push(line);
    },
    authPath: undefined,
  };
  return { io, logs, errs, saveCalls };
}

describe("runLogin", () => {
  let recorded: RecordedIO;

  describe("on successful claude /login (exit 0)", () => {
    let result: LoginResult;
    beforeEach(async () => {
      recorded = makeIO({ exitCode: 0 });
      result = await runLogin(recorded.io);
    });

    it("returns ok=true with exit 0", () => {
      expect(result).toEqual({ ok: true, exitCode: 0 });
    });

    it("persists subscription choice via saveAuth", () => {
      // The bug aman hit: claude /login succeeded but auth.json was never
      // written, so applyPersistedAuthEnv had nothing to bridge on next run.
      expect(recorded.saveCalls).toHaveLength(1);
    });

    it("tells the user to run `niato`, not `pnpm chat`", () => {
      const all = recorded.logs.join("\n");
      expect(all).toContain("niato");
      expect(all).not.toContain("pnpm chat");
    });
  });

  describe("when claude /login exits non-zero", () => {
    let result: LoginResult;
    beforeEach(async () => {
      recorded = makeIO({ exitCode: 7 });
      result = await runLogin(recorded.io);
    });

    it("returns ok=false carrying the exit code", () => {
      expect(result).toEqual({ ok: false, exitCode: 7 });
    });

    it("does NOT persist auth — the user is not authenticated", () => {
      expect(recorded.saveCalls).toHaveLength(0);
    });
  });

  describe("when `claude` is not installed (ENOENT)", () => {
    let result: LoginResult;
    beforeEach(async () => {
      // ENOENT errors from spawn are real Error instances with a `code`
      // property attached. Mirror that shape so isFileNotFound() narrows.
      const enoent = Object.assign(new Error("spawn claude ENOENT"), {
        code: "ENOENT",
      });
      recorded = makeIO({ spawnError: enoent });
      result = await runLogin(recorded.io);
    });

    it("returns ok=false without throwing", () => {
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it("does NOT persist auth", () => {
      expect(recorded.saveCalls).toHaveLength(0);
    });

    it("points the user at the Claude Code install URL", () => {
      const all = recorded.errs.join("\n");
      expect(all).toContain("docs.claude.com");
    });
  });

  describe("on unexpected spawn error", () => {
    it("propagates the error to the caller", async () => {
      recorded = makeIO({ spawnError: new Error("boom") });
      await expect(runLogin(recorded.io)).rejects.toThrow("boom");
    });
  });
});

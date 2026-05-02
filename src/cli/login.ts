import { spawn } from "node:child_process";
import {
  saveAuth as defaultSaveAuth,
  defaultAuthPath,
} from "./tui/store/auth.js";

// Approach A login: thin wrapper that delegates to `claude /login`. Same
// OAuth flow, same token storage (~/.claude/), same Anthropic-facing
// endpoints — Niato just makes the command discoverable under its own
// surface so users don't have to remember Claude Code's CLI separately.
//
// The persistence step on success is what closes the UX gap: without it,
// claude /login would store tokens in ~/.claude/ but Niato's runtime
// (resolveAuthMode → applyPersistedAuthEnv) had no way to know the user
// had picked the subscription path.

const CLAUDE_CODE_INSTALL_URL =
  "https://docs.claude.com/en/docs/claude-code/quickstart";

export interface LoginIO {
  runClaudeLogin: () => Promise<number>;
  saveAuth: (path: string | undefined) => void;
  log: (line: string) => void;
  err: (line: string) => void;
  authPath: string | undefined;
}

export interface LoginResult {
  ok: boolean;
  exitCode: number;
}

function isFileNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    // Cast: ENOENT errors carry a string `code`; we only branch on it,
    // and read it through `unknown` first to avoid any blind cast.
    (err as { code?: unknown }).code === "ENOENT"
  );
}

export async function runLogin(io: LoginIO): Promise<LoginResult> {
  io.log("Niato uses Claude Code's authentication for the subscription path.");
  io.log("Launching `claude /login`...\n");

  let exitCode: number;
  try {
    exitCode = await io.runClaudeLogin();
  } catch (err: unknown) {
    if (isFileNotFound(err)) {
      io.err("\nClaude Code isn't installed (or `claude` isn't on PATH).\n");
      io.err(
        "Niato uses Claude Code's OAuth session for the subscription auth path.",
      );
      io.err(`Install Claude Code: ${CLAUDE_CODE_INSTALL_URL}`);
      io.err("Then run `niato login` again.\n");
      io.err(
        "Alternative: set ANTHROPIC_API_KEY in your shell to use the API-key path.",
      );
      return { ok: false, exitCode: 1 };
    }
    throw err;
  }

  if (exitCode !== 0) {
    io.err(`\nclaude /login exited with code ${String(exitCode)}.`);
    return { ok: false, exitCode };
  }

  // Persist the subscription choice so the next `niato` run picks up the
  // OAuth path automatically (applyPersistedAuthEnv reads ~/.niato/auth.json
  // at TUI startup and bridges to NIATO_AUTH=subscription). Without this,
  // claude /login would succeed but the next launch would crash with "no
  // authentication configured" — the cascading-error bug from issue #N.
  io.saveAuth(io.authPath);
  io.log("\n✓ Authenticated. Try: niato");
  return { ok: true, exitCode: 0 };
}

function defaultRunClaudeLogin(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["/login"], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

export function defaultLoginIO(): LoginIO {
  return {
    runClaudeLogin: defaultRunClaudeLogin,
    saveAuth: (path) => {
      defaultSaveAuth({ mode: "subscription" }, path ?? defaultAuthPath());
    },
    log: (line) => {
      console.log(line);
    },
    err: (line) => {
      console.error(line);
    },
    authPath: undefined,
  };
}

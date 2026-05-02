import { spawn } from "node:child_process";

// Wraps `claude setup-token` for discoverability under `niato setup-token`.
// Per Anthropic's docs, the token is printed to terminal and NOT saved
// anywhere — the user copies it and exports CLAUDE_CODE_OAUTH_TOKEN.
// Niato deliberately does not capture the printed token (would require
// non-passthrough stdio + parsing) — that's a credential-handling
// boundary we don't want to cross.

const CLAUDE_CODE_INSTALL_URL =
  "https://docs.claude.com/en/docs/claude-code/quickstart";

export interface SetupTokenIO {
  runClaudeSetupToken: () => Promise<number>;
  log: (line: string) => void;
  err: (line: string) => void;
}

export interface SetupTokenResult {
  ok: boolean;
  exitCode: number;
}

function isFileNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    // Cast: ENOENT errors carry a string `code`; we read it through
    // `unknown` first to avoid any blind cast.
    (err as { code?: unknown }).code === "ENOENT"
  );
}

export async function runSetupToken(
  io: SetupTokenIO,
): Promise<SetupTokenResult> {
  io.log(
    "Niato wraps `claude setup-token` to generate a long-lived OAuth token.",
  );
  io.log("This token is best for CI / scripts / headless environments.");
  io.log("Launching `claude setup-token`...\n");

  let exitCode: number;
  try {
    exitCode = await io.runClaudeSetupToken();
  } catch (err: unknown) {
    if (isFileNotFound(err)) {
      io.err("\nClaude Code isn't installed (or `claude` isn't on PATH).\n");
      io.err(`Install Claude Code: ${CLAUDE_CODE_INSTALL_URL}`);
      io.err("Then run `niato setup-token` again.\n");
      return { ok: false, exitCode: 1 };
    }
    throw err;
  }

  if (exitCode !== 0) {
    io.err(`\nclaude setup-token exited with code ${String(exitCode)}.`);
    return { ok: false, exitCode };
  }

  // Deliberately do NOT capture the token. The printed-to-terminal flow IS
  // the contract — users copy it themselves. Niato just tells them what
  // env var to export and what command to run next.
  io.log("");
  io.log("Next steps:");
  io.log("  export CLAUDE_CODE_OAUTH_TOKEN=<paste-token-from-above>");
  io.log("  niato");
  return { ok: true, exitCode: 0 };
}

function defaultRunClaudeSetupToken(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["setup-token"], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

export function defaultSetupTokenIO(): SetupTokenIO {
  return {
    runClaudeSetupToken: defaultRunClaudeSetupToken,
    log: (line) => {
      console.log(line);
    },
    err: (line) => {
      console.error(line);
    },
  };
}

import { spawn } from "node:child_process";

// Approach A login: thin wrapper that delegates to `claude /login`. Same
// OAuth flow, same token storage (~/.claude/), same Anthropic-facing
// endpoints — Nawaitu just makes the command discoverable under its own
// surface so users don't have to remember Claude Code's CLI separately.
//
// Deliberately does NOT reimplement the OAuth flow. That would require an
// independently-registered OAuth client and would sharpen the ToS
// question discussed in the README's "Note on subscription auth".

const CLAUDE_CODE_INSTALL_URL =
  "https://docs.claude.com/en/docs/claude-code/quickstart";

async function runClaudeLogin(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["/login"], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

function isFileNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

async function main(): Promise<void> {
  console.log(
    "Nawaitu uses Claude Code's authentication for the subscription path.",
  );
  console.log("Launching `claude /login`...\n");

  let exitCode: number;
  try {
    exitCode = await runClaudeLogin();
  } catch (err: unknown) {
    if (isFileNotFound(err)) {
      console.error("\nClaude Code isn't installed (or `claude` isn't on PATH).\n");
      console.error(
        "Nawaitu uses Claude Code's OAuth session for the subscription auth path.",
      );
      console.error(`Install Claude Code: ${CLAUDE_CODE_INSTALL_URL}`);
      console.error("Then run `pnpm login` again.\n");
      console.error(
        "Alternative: set ANTHROPIC_API_KEY in your .env to use the API-key path.",
      );
      process.exit(1);
    }
    throw err;
  }

  if (exitCode === 0) {
    console.log("\n✓ Authenticated. Try: pnpm chat");
  } else {
    console.error(`\nclaude /login exited with code ${String(exitCode)}.`);
    process.exit(exitCode);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(msg);
  process.exit(1);
});

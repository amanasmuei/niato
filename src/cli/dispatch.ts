// Pure subcommand router for bin/nawaitu. The bin script handles process
// concerns (spawning, exit codes, version reading); this module owns the
// arg → entry mapping so it can be unit tested without spinning subprocesses.

export type DispatchResult =
  | { kind: "entry"; entry: string; forwardArgs: string[] }
  | { kind: "version" }
  | { kind: "help" }
  | { kind: "unknown"; subcommand: string };

const ENTRIES: Record<string, string> = {
  tui: "cli/tui/index.js",
  chat: "cli-chat.js",
  login: "cli-login.js",
};

export function resolveDispatch(args: readonly string[]): DispatchResult {
  const first = args[0];
  if (first === undefined) {
    // Default subcommand is 'tui'. Cast: ENTRIES["tui"] is statically present
    // in the const map above; the lookup is exhaustive at config time.
    const tuiEntry = ENTRIES["tui"];
    if (tuiEntry === undefined) {
      throw new Error("dispatch: tui entry missing from ENTRIES");
    }
    return { kind: "entry", entry: tuiEntry, forwardArgs: [] };
  }
  if (first === "--version" || first === "-v") return { kind: "version" };
  if (first === "--help" || first === "-h") return { kind: "help" };

  const entry = ENTRIES[first];
  if (entry !== undefined) {
    return { kind: "entry", entry, forwardArgs: args.slice(1) };
  }
  return { kind: "unknown", subcommand: first };
}

export function helpText(): string {
  return [
    "nawaitu — intent-routing agent on the Claude Agent SDK",
    "",
    "Usage:",
    "  nawaitu                 launch the TUI (default)",
    "  nawaitu tui             same",
    "  nawaitu chat [--reset]  legacy multi-turn REPL",
    "  nawaitu login           OAuth subscription auth (wraps `claude /login`)",
    "  nawaitu --version       print version",
    "  nawaitu --help          show this help",
    "",
    "Auth (set one in your shell):",
    "  ANTHROPIC_API_KEY=sk-ant-...    developer API path (recommended)",
    "  NAWAITU_AUTH=subscription       Claude subscription path (review ToS)",
  ].join("\n");
}

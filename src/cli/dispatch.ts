// Pure subcommand router for bin/niato. The bin script handles process
// concerns (spawning, exit codes, version reading); this module owns the
// arg → entry mapping so it can be unit tested without spinning subprocesses.

export type DispatchResult =
  | { kind: "entry"; entry: string; forwardArgs: string[] }
  | { kind: "version" }
  | { kind: "help" }
  | { kind: "unknown"; subcommand: string };

const ENTRIES = {
  tui: "cli/tui/index.js",
  chat: "cli-chat.js",
  login: "cli-login.js",
} as const;

export function resolveDispatch(args: readonly string[]): DispatchResult {
  const first = args[0];
  if (first === undefined) {
    return { kind: "entry", entry: ENTRIES.tui, forwardArgs: [] };
  }
  if (first === "--version" || first === "-v") return { kind: "version" };
  if (first === "--help" || first === "-h") return { kind: "help" };

  if (first in ENTRIES) {
    // `in` narrows the object, not the string; the cast safely propagates
    // that narrowing into the lookup.
    const entry = ENTRIES[first as keyof typeof ENTRIES];
    return { kind: "entry", entry, forwardArgs: args.slice(1) };
  }
  return { kind: "unknown", subcommand: first };
}

export function helpText(): string {
  return [
    "niato — intent-routing agent on the Claude Agent SDK",
    "",
    "Usage:",
    "  niato                 launch the TUI (default)",
    "  niato tui             same",
    "  niato chat [--reset]  legacy multi-turn REPL",
    "  niato login           OAuth subscription auth (wraps `claude /login`)",
    "  niato --version       print version",
    "  niato --help          show this help",
    "",
    "Auth (set one in your shell):",
    "  ANTHROPIC_API_KEY=sk-ant-...    developer API path (recommended)",
    "  NIATO_AUTH=subscription       Claude subscription path (review ToS)",
  ].join("\n");
}

# Niato v0.4.0 — Conversation Memory

**Sessions remember.** A turn-2 question like "what did we just talk about" now gets a coherent answer instead of a confused restart. v0.4 wires the Agent SDK's built-in session management (`Options.sessionId` for the first turn, `Options.resume` thereafter) so the model sees the prior conversation when generating its next reply.

## What's new

- **Cross-turn memory in `niato.run()`.** Pass the same `sessionId` to two consecutive `run()` calls and the second one is a resume. The SDK handles compaction automatically when context fills.
- **Stable per-session storage.** SDK transcripts persist at `~/.niato/sdk-sessions/` regardless of where the user launched `niato` from. Previous behavior leaked into `~/.claude/projects/<cwd>/...` based on shell cwd, which made memory non-portable across launch directories.
- **TUI Resume Last works coherently.** Selecting "Resume last" in the launcher restores conversational state, not just the JSONL turn list. No code change in the TUI itself — the Ink session hook already forwarded `sessionId` to `niato.run()`; v0.4's compose-layer threading does the rest.

## Architecture

`SessionContext` gains a `started: boolean` flag. `compose.ts` reads it and decides between SDK `sessionId` (first turn) and `resume` (subsequent turns). After a successful turn, the flag flips. This matches `ARCHITECTURE.md` §9 *"SDK-managed; persist transcript by session_id"*.

We chose this over a custom running-summary loop because (1) the SDK already handles compaction with battle-tested behavior under context overflow, and (2) `ARCHITECTURE.md` explicitly steers away from rolling our own ("Don't reinvent it").

## Migration

None needed for callers. Anyone who previously kept their own `sessionId` mental model gets resume behavior automatically.

If you have leftover SDK session files at `~/.claude/projects/<your-cwd>/`, they're orphans now (Niato writes to `~/.niato/sdk-sessions/` going forward). Safe to delete or leave.

## Up next

`docs/superpowers/plans/2026-04-30-v1-release-roadmap.md` — Plan 4 (v1.0 polish): error UX, default packs, eval baselines.

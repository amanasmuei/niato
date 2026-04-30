# Changelog

All notable changes to Niato, since v0.2.0 (the first publishable release).

## v1.0.0 — 2026-04-30

### Added
- `classifyError()` helper at `src/cli/error-classify.ts` — pattern-matches network / 401 / 429 / zod errors into friendly messages
- TUI session hook uses `classifyError` to render actionable error states
- `NIATO_PACKS` env var opts the TUI in to Support and Dev Tools packs
- v1.0.0 release notes + this CHANGELOG

### Changed
- TUI ships with Generic pack only by default (was: all three packs always loaded)

### Deferred to v1.x
- Eval baselines (`--write-baseline`) — needs API budget
- `pr_creator` specialist + `protectedBranchGate` hook — needs real GitHub MCP wiring

## v0.4.0 — 2026-04-30

### Added
- Conversation memory across turns via SDK `Options.sessionId` (first turn) / `Options.resume` (subsequent)
- `SessionContext.started: boolean` flag drives the threading
- `OrchestratorInput` gains `sessionId?`, `resume?`, `cwd?`
- `buildOrchestratorOptions` helper extracted from `runOrchestrator`
- Stable per-session storage at `~/.niato/sdk-sessions/`
- `tests/conversation-memory.test.ts` — cross-turn contract assertion

## v0.3.0 — 2026-04-30

### Added
- `ApiKeyEntry` Ink screen for in-app API key onboarding
- `CompanionWizard` Ink screen — 4-step in-Ink companion setup
- TUI Settings → reset routes to in-app screens

### Removed
- v0.2's `pnpm chat` hand-off for companion setup
- v0.2's "set ANTHROPIC_API_KEY in shell and re-run" exit message for missing api-key

## v0.2.0 — 2026-04-30

### Added
- MIT LICENSE
- `NiatoAuthError` — typed error thrown when neither auth path is configured
- `NIATO_AUTH=subscription` env var — explicit opt-in for OAuth subscription path
- `bin/niato` Node-based dispatcher (no pnpm dependency for npm consumers)
- `src/cli/dispatch.ts` — pure routing logic for the bin
- Postbuild step that copies `*.md` prompt files from `src/` to `dist/`
- `npm i -g niato` is the recommended install path

### Changed
- `package.json`: `private: false`, `license: MIT`, `publishConfig.access: public`, `keywords`, `files`
- `resolveAuthMode` requires explicit auth configuration (was: silently defaulted to OAuth)
- `EnvSchema` validates `NIATO_AUTH` as `z.literal("subscription").optional()`
- `ARCHITECTURE.md` status line reflects shipped state (no longer "no code yet")

### Fixed
- `ink`, `react`, `ink-spinner` moved to `dependencies` (TUI would have crashed on npm install otherwise)
- README incorrect statement about which env var wins when both are set
- TUI top-level `main().catch` renders `NiatoAuthError` instead of stack trace

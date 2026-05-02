# Changelog

All notable changes to Niato, since v0.2.0 (the first publishable release).

## v1.0.4 — 2026-05-02

### Added
- **Eval baselines committed for all three packs** (`src/packs/{generic,support,dev-tools}/evals/baseline.json`). Closes README backlog item #1 — the CI eval gate is now active. Baseline floors:
  - `generic`: 20/20
  - `support`: 23/25
  - `dev_tools`: 25/25

### Fixed
- **Classifier robustness on OAuth path.** Added `allowedTools: []` so the classifier can't reach for tools on action-phrased inputs (`"fix the bug"`, `"run the test suite"`); raised `maxTurns` to 20 to give the SDK's structured-output flow generous headroom under OAuth. API-key path still completes in 1 turn — the cap is a ceiling, not a target.
- **Eval runner records classifier failures as failed cases instead of aborting the suite.** A flaky single case must not invalidate the other 24. `EvalCaseResult` gains an optional `error?: string` field; `runPackEvals` now wraps each `classify()` in try/catch.

## v1.0.3 — 2026-05-01

### Fixed
- **OAuth subscription path** now actually works end-to-end. Two pre-existing bugs masked each other:
  - `~/.niato/sdk-sessions/` was assumed to exist as the SDK child-process `cwd` but never auto-created — fresh installs hit a misleading "Claude Code native binary not found" error. `createNiato()` now `mkdirSync(..., { recursive: true })` at startup.
  - Classifier `maxTurns: 1` was sufficient on the API-key path but caused `error_max_turns` on the OAuth path's `json_schema` flow. Bumped to `maxTurns: 2`. Harmless on API-key (model exits early when ready); unblocks OAuth.
- Both bugs were never caught in CI because every E2E suite auto-skips when `ANTHROPIC_API_KEY` is unset, and CI runs with no key.

### Auth notes (no code change, doc clarification)
- The Agent SDK reads `CLAUDE_CODE_OAUTH_TOKEN`, NOT `ANTHROPIC_API_KEY`, on the OAuth path. Pasting an `sk-ant-oat01-` token into `ANTHROPIC_API_KEY` will be sent as a Bearer header and rejected by Anthropic.
- Generate a token via `claude setup-token` (requires Pro/Max/Team/Enterprise subscription). Personal use only per Anthropic ToS — distributed products must use a developer API key.

## v1.0.2 — 2026-05-01

### Changed
- Corrected npm scope from `@amanasmuei` to `@aman_asmuei` (with underscore) to match the actual npm account. v1.0.1 failed to publish because the `@amanasmuei` scope did not exist on the registry.

## v1.0.1 — 2026-05-01

### Changed
- Renamed npm package from `niato` to `@amanasmuei/niato` *(superseded — see v1.0.2)*. The unscoped name was rejected by npm at publish time as too similar to existing packages (`nano`, `nats`).

### Fixed
- v1.0.0's release CI run failed at the `Publish to npm` step due to the name-similarity rejection (the build itself was clean).

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

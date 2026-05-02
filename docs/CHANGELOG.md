# Changelog

All notable changes to Niato, since v0.2.0 (the first publishable release).

## v1.3.0 — 2026-05-02

Phase 4.5: live introspection. The TUI now streams what the orchestrator
is doing as it happens — specialist dispatches, tool calls and their
results, and inline approval prompts when a hook requests one. Pairs
with a defensive safety hardening so the deny-on-ask posture is
explicit, not inferred from undocumented SDK fallback behavior.

### Added
- **`Niato.runStream(input, sessionId, onEvent)`** — streaming variant of `run()`. Emits a typed `NiatoEvent` per lifecycle moment (`turn_start`, `classified`, `specialist_dispatched`, `tool_call`, `tool_result`, `approval_requested`, `approval_resolved`, `turn_failed`, `turn_complete`). Existing `run()` is unchanged — internally it's `runStream` with a no-op event callback.
- **`NiatoOptions.approval?: ApprovalChannel`** — wires inline approval prompts. When set, hooks returning `permissionDecision: "ask"` route through the SDK's `Options.canUseTool` to the channel; the TUI consumes them via `useLiveEvents` + `LivePanel` and resolves on `[a]`/`[d]` keypress. Channel API: `src/guardrails/approval-channel.ts` (abort-safe, dup-id-throwing, listener-exception-isolated, late-subscriber-replaying).
- **`LivePanel` Ink component** — renders the live specialist→tool tree with status ticks (✓ ok, ✗ error, ⊘ blocked, animated `<Spinner type="dots"/>` for in-flight) and the inline approval prompt. Approval-pending tools get a `← awaiting approval` inline marker on the matching row so the prompt isn't visually disconnected. Mounted in the session screen between scrollback and the input row.
- **`headlessDenyCanUseTool`** — defensive built-in `canUseTool` wired in `compose.ts` whenever `NiatoOptions.approval` is undefined. Auto-denies any `permissionDecision: "ask"` hook decision, so the safety property is explicit and SDK-version-independent (no longer relies on undocumented SDK fallback for missing `canUseTool`).
- **`dollar_limit` hook migrated to `permissionDecision: "ask"`** — over-threshold refunds (Support pack) now pause for human approval in the TUI instead of always denying. Headless deployments still deny by default via the new built-in. Validates the substrate end-to-end with a real pack hook.
- **`turn_failed` event** — emitted when classifier or orchestrator throws after `turn_start`. LivePanel consumers can correlate failures by `turnId` instead of needing per-consumer try/catch around `runStream`.
- **Phase 4.5 docs** — `ARCHITECTURE.md` §10 has a new "Inline approval via canUseTool" paragraph describing the routing + the `permissionMode: "default"` + `canUseTool` always-wired contract; §15 has a new Phase 4.5 entry. CLAUDE.md / AGENTS.md invariant #5 updated to use the SDK's actual hook shape (`permissionDecision: "deny"` instead of the stale `{ action: "block" }`).

### Fixed
- **`extractGuardrailsTriggered` covers all SDK result subtypes that carry `permission_denials`.** Previously narrowed only on `success` + `error_during_execution`; turns ending via `error_max_turns`, `error_max_budget_usd`, or `error_max_structured_output_retries` silently dropped denied tool calls from the audit trail. Same gap fixed in `event-stream.ts`. Drops the subtype filter entirely now that the SDK union has been verified — every result subtype carries the field, and TS will catch any future subtype that doesn't.
- **`useInput` sibling capture** in the session screen no longer contaminates the user's draft buffer during approval prompts. `TextInput` gained an `isActive?: boolean` prop; the screen passes `isActive={live.pendingApproval === undefined}` so `[a]`/`[d]` keystrokes resolve the prompt cleanly without leaking into the next prompt.
- **Mount flicker** between submit and the first `turn_start` event closed by including `"classifying"` in the LivePanel mount condition.

### Changed
- **`OrchestratorInput` gains optional `onEvent`, `canUseTool`, `logger`, `queryImpl`** (the last is a test-only DI seam). All optional and additive — existing callers continue to work unchanged. The new `logger` field lets the orchestrator log onEvent callback errors at warn (matches `compose.ts`'s `onTurnComplete` callback handling).
- **`Niato` interface gains `runStream`** alongside the unchanged `run`, `metrics`, `remember` methods.

## v1.2.1 — 2026-05-02

Patch release — closes the api-key bridge gap left as a TODO in v1.2.0,
and quiets the GitHub Actions Node.js 20 deprecation warning.

### Fixed
- **In-app api-key entry now reaches `resolveAuthMode` end-to-end.** The
  v1.2.0 release shipped with a known TODO: `onApiKeySubmit` saved the
  key to `~/.niato/auth.json` but never bridged it into `process.env`,
  so users who picked the API-key path through the TUI still hit "no
  auth configured" on next launch. Two fixes:
  - `applyPersistedAuthEnv` (TUI startup, runs before niatoFactory)
    now bridges api-key files → `ANTHROPIC_API_KEY`. Symmetric with
    the existing subscription bridge.
  - `onApiKeySubmit` (TUI flow, same launch) sets the env var
    immediately. Otherwise a user who entered a key and then picked
    "New session" without restarting niato would still throw, because
    the file → env bridge only runs at startup.
- Pre-existing shell `ANTHROPIC_API_KEY` always wins over the persisted
  file value — explicit shell config beats TUI choice, mirroring the
  subscription bridge's precedence.

### Changed
- `.github/workflows/{ci,release}.yml`: opt into Node.js 24 runtime for
  bundled JS actions via `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`.
  Removes the deprecation warning that GitHub flips on every run; safe
  to drop once `actions/checkout@v5` etc. ship Node-24 native builds
  and we update the pins.

## v1.2.0 — 2026-05-02

Auth UX hardening + a third auth path. All additive — no breaking changes.

### Added
- **`niato setup-token` subcommand** — wraps `claude setup-token` to surface long-lived OAuth tokens for CI / scripts / containers / any environment where interactive browser login isn't available. Token is printed by Claude Code to terminal; niato deliberately does NOT capture or persist it (Anthropic policy). New entry: `src/cli/setup-token.ts` + `src/cli-setup-token.ts`; registered in `src/cli/dispatch.ts`.
- **`CLAUDE_CODE_OAUTH_TOKEN` recognized as a third `AuthMode`.** The Agent SDK already reads it natively (`sdk.mjs`); niato's `resolveAuthMode` previously only knew `ANTHROPIC_API_KEY` and `NIATO_AUTH=subscription`, so users with the SDK-blessed token would still hit "no auth configured." Now classified as `"oauth_token"` with documented priority: token > NIATO_AUTH > API key > throw.
- **`isAuthConfigured()` predicate** in `src/cli/tui/auth-env.ts` — boolean over file OR any of the three env vars. Used by the TUI initial-screen gate so shell-level env-var auth doesn't get routed unnecessarily through first-run.
- **`pnpm setup-token`** dev script for parity with `pnpm login`.

### Fixed
- **`niato login` UX cascade** (the bug Aman hit on first install). Three root causes:
  - `niato login` shelled out to `claude /login` but never persisted the user's auth choice. Next `niato` run threw "no auth configured." Now writes `~/.niato/auth.json` with `{ mode: "subscription" }` after exit-0, so `applyPersistedAuthEnv()` has something to bridge.
  - Login success message said `"Try: pnpm chat"` (dev-repo wording) instead of `"Try: niato"` (installed-package wording). Fixed.
  - Throw inside `useNiatoSession`'s `useState` initializer escaped React/Ink and surfaced the error 3-4 times with leaked `/opt/homebrew/...` install paths. The TUI initial-screen gate now refuses to mount Session without auth — routes through first-run instead.
- **Latent regression from v1.1.0 gating** — users with `ANTHROPIC_API_KEY` set in shell but no `~/.niato/auth.json` were unnecessarily routed through first-run on every launch. The new `isAuthConfigured()` predicate fixes that for all three env-var paths.
- **Non-TUI entries (`pnpm dev`, `pnpm dev:multi`, `niato chat`)** now also call `applyPersistedAuthEnv()`. Previously only the TUI entry did, so users who ran `niato login` then `niato chat` hit the same "no auth configured" throw.

### Changed
- `AuthMode` union extended: `"api_key" | "oauth_subscription" | "oauth_token"`.
- `resolveAuthMode` error message rewritten to name the niato commands that drive each path (`niato login`, `niato setup-token`) alongside the env vars.
- README Authentication section now documents all three paths in priority order with use-case framing (laptop / CI / production). Quick start updated similarly.
- `helpText()` in `src/cli/dispatch.ts` rewritten to surface `niato setup-token` and the auth-path table.

### Internal
- Refactored `src/cli-login.ts` into a thin script around `runLogin(io)` in `src/cli/login.ts` for testability. Same shape applied to `setup-token`.

## v1.1.0 — 2026-05-02

Four post-1.0 backlog items shipped together. All additive — no breaking changes.

### Added
- **`pr_creator` specialist + `protectedBranchGate` hook** in the dev-tools pack — closes the last unimplemented promise in ARCHITECTURE.md §7.3.
  - `dev_tools_github_stub` MCP server with a `create_pull_request` tool (mirrors `support_stub`); real GitHub MCP wiring deferred to a future release.
  - `protectedBranchGate({ allowedBranches? })` — denies PRs targeting `main`, `master`, `^release/` by default; deny-with-reason pattern surfaces to the orchestrator for replan/escalate.
  - 5 new eval cases for the `create_pr` intent.
- **Long-term cross-session memory** — file-based default at `~/.niato/memory/<userId>.json` with a thin `MemoryStore` interface (Redis/Postgres pluggable later — deviation from ARCHITECTURE.md §9 noted in that doc).
  - Opt-in via `createNiato({ memory: { ... } })`; backward compatible.
  - Explicit `niato.remember(facts: string[])` API; auto-extraction deferred to v1.x.
  - Soft cap of 100 facts (~4KB); overflow truncates oldest + emits warn log.
  - System prompt composition: persona → memory → ORCHESTRATOR_PROMPT.
  - Architectural invariant #4 enforced by structural test: specialists never see memory; only the orchestrator does.
  - New env var: `NIATO_USER_ID` (defaults to `"default"`).
- **TUI multi-turn history dashboard** — new `History` screen between "Resume last" and "Settings" in the launcher. Reads from existing JSONL session storage (`~/.niato/sessions/`); no new dependencies, manual windowed scroll via Ink `useInput`.
- **OpenTelemetry adapter** — copy-paste recipe at `docs/otel-adapter.ts` + explainer at `docs/otel-adapter.md`. No new package, no peer-dep — `TurnRecord` is the public contract; users wire it through `onTurnComplete`. Datadog covered via the OTel receiver — same code.

### Changed
- `TurnRecord` gains a `startedAt: string` (ISO 8601) field for accurate OTel span start timestamps. Threaded from `compose.ts`'s existing `Date.now()` start instant.
- `Niato` interface gains a `remember(facts: string[]): Promise<void>` method when `memory` is configured (no-op otherwise).
- README `Backlog (post-1.0)` reduced to one item (real GitHub MCP wiring); shipped items moved to a new `Shipped (post-1.0)` section.

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

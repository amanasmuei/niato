# Niato v1.0.0 — General Availability

**The polish gate.** v1.0.0 is the version where Niato is ready for anyone to install, set up, and use without surprises. Plans 1–4 of the v1 release roadmap (`docs/superpowers/plans/2026-04-30-v1-release-roadmap.md`) are complete.

## What's new in v1.0.0

- **Friendly error messages.** Network failures, 401 / 429 responses, and malformed model output now render as actionable explanations instead of raw stack traces. The TUI session screen surfaces them in the existing error phase; library consumers can call `classifyError(err)` from `niato/cli/error-classify` to get the same classification.
- **TUI default packs reduced to Generic.** Support and Dev Tools were demo packs — Support's MCP is an in-process stub. New users no longer get pretend refund data on their first turn. To opt in: `NIATO_PACKS=support,dev_tools` in the shell. The library's `createNiato({ packs })` API is unchanged.

## What's deferred to v1.x backlog

- **Eval baselines (`pnpm eval <pack> --write-baseline`)** — needs an API budget to run the live golden suites. CI's no-regression gate is wired but waiting on the first baseline commit.
- **`pr_creator` specialist + `protectedBranchGate` hook** — needs real GitHub MCP wiring + auth + remote-branch storage. Reintroduce when GitHub MCP lands behind a concrete deployment.

These are tracked in the roadmap doc; neither blocks v1.0.

## The full path to 1.0

| Plan | Version | Theme |
| ---- | ------- | ----- |
| 1 | v0.2.0 | Release prep — license, npm-publishable, NIATO_AUTH opt-in, Node bin dispatcher |
| 2 | v0.3.0 | In-app onboarding — Ink-native ApiKeyEntry + CompanionWizard |
| 3 | v0.4.0 | Conversation memory — SDK sessionId/resume threading |
| 4 | v1.0.0 | Polish — friendly errors, default packs, CHANGELOG |

Each plan shipped as its own release branch (`release/v0.2.0`, `release/v0.3.0`, `release/v0.4.0`, `release/v1.0.0`), tagged at HEAD, and fast-forwarded to `master`. The plan docs are at `docs/superpowers/plans/`.

## Migration

None needed. v1.0.0 is the same orchestrator + classifier + packs you've been using; only the TUI's default pack list changed. Programmatic consumers of `createNiato({ packs })` are unaffected.

## Publishing

`npm publish` is the user's call. The repo ships ready to publish (`private: false`, `license: MIT`, `publishConfig.access: public`, `files` allowlist verified by smoke test in v0.2). Run from master after `npm login`.

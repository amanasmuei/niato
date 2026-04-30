# Niato v1.0 Release Roadmap

> **Status:** roadmap (meta-plan). Each numbered plan below is its own detailed implementation plan with TDD tasks. Execute in order.

**Goal:** Take Niato from `0.1.0` (works on the author's machine) to `1.0.0` (anyone can install and use it perfectly), in four sequential plans that each ship working software on their own.

**Why split.** The work spans multiple independent subsystems (release packaging, onboarding UX, conversation memory, polish). Per the writing-plans skill, multi-subsystem scope should break into separate plans, each producing a demoable release. Forcing them into one plan would make execution and review unwieldy.

**Why this order.** Plan 1 unblocks all distribution. Without it, Plans 2–4 are theoretical because no one outside this repo can install Niato. Plan 2 makes the install actually usable for non-developers. Plan 3 is the biggest *companion-feel* win and the largest engineering scope. Plan 4 is the v1.0.0 polish gate.

---

## The four plans

### Plan 1 — Release prep (v0.2.0)
**File:** `docs/superpowers/plans/2026-04-30-v0.2-release-prep.md`

**Scope:**
- Pick a license (MIT recommended) and add `LICENSE` file
- Resolve subscription-auth ToS posture: gate OAuth subscription path behind explicit opt-in (`NIATO_AUTH=subscription`), default new installs to API-key-only with a clear no-key error message
- `package.json`: bump to `0.2.0`, flip `"private": false`, add `publishConfig`, set correct `files` and `bin` for npm consumption
- README rewrite: install via `npx niato` / `npm i -g niato`, not `pnpm link`
- `ARCHITECTURE.md:7` status line fix (still says "no code yet")
- `npm pack` smoke test: produced tarball installs cleanly in a scratch dir and `niato --version` works

**Out of scope:** publishing to the npm registry. That's a one-shot manual `npm publish` once Aman is ready; the plan ends with the package *ready to publish*, not *published*. Brand/marketing work (screencasts, landing page) is separate.

**Why first.** Mostly configuration and decision-recording — light engineering — so the unblocking value per hour is highest. Subscription-auth gating is the only behavior change.

### Plan 2 — In-app onboarding (v0.3.0)
**File:** `docs/superpowers/plans/2026-04-30-v0.3-in-app-onboarding.md` *(to be written after Plan 1 ships)*

**Scope:**
- Replace the "go run `pnpm chat`" hand-off (`src/cli/tui/app.tsx:175-184`) with an Ink-native companion wizard screen — name, voice archetype, optional description, written to `~/.niato/companion.json` from inside the TUI
- Add an in-app API key entry screen. Today, `app.tsx:159-168` errors out and exits if `ANTHROPIC_API_KEY` isn't already exported in the shell. New flow: prompt for the key, validate against a lightweight Anthropic API call, write to `~/.niato/auth.json` with `chmod 600`
- Settings → reset companion + reset auth route to the new in-app flows, not `pnpm chat --reset` hints
- First-run becomes fully self-contained: install → run `niato` → done. No second command required

**Why second.** Plan 1's distribution work is meaningless if the first-run experience drops to `pnpm chat`. Once a stranger can install via npm, they need an install-to-first-turn flow that doesn't require the repo.

### Plan 3 — Conversation memory (v0.4.0)
**File:** `docs/superpowers/plans/2026-04-30-v0.4-conversation-memory.md` *(to be written after Plan 2 ships)*

**Scope:**
- Pick a memory model: SDK compaction (cheapest, in-loop), per-session running summary persisted to `~/.niato/sessions/{id}.jsonl`, or a Level-3 long-term KV store. Brainstorming session before plan-writing
- Wire prior-turn summary into the orchestrator system prompt so the model can answer "what did we just discuss"
- Persist summary alongside JSONL turns; reload on session resume
- Eval: at least 5 test cases asserting conversation continuity ("user asked X turn 1, follow-up turn 2 references X correctly")

**Why third.** The biggest companion-feel win — but also the biggest engineering scope, with real architectural choices. Doing it after onboarding means the first-run flow stays simple while we iterate on memory.

### Plan 4 — Polish (v1.0.0)
**File:** `docs/superpowers/plans/2026-04-30-v1.0-polish.md` *(to be written after Plan 3 ships)*

**Scope:**
- **Error UX pass:** graceful Ink screens for network failure, 429 rate-limit, expired OAuth token, malformed classifier output. Today these throw to stderr
- **Pack defaults:** TUI ships with `genericPack` only by default; Support and Dev Tools packs become opt-in via `~/.niato/packs.json` or env. Reason: Support's MCP is a stub — a stranger asking for a refund should not get pretend data
- **Eval baselines captured:** run `pnpm eval <pack> --write-baseline` for all three packs, commit `baseline.json` files. Unblocks CI's no-regression gate
- **`pr_creator` + `protectedBranchGate`** deferred from Phase 5 — only if real GitHub MCP wiring is in scope. Otherwise document as a post-1.0 follow-up
- **v1.0.0 cut:** version bump, CHANGELOG, git tag, npm publish

**Why last.** Each item is small but together they're the difference between "shipping" and "perfect." Doing them last means the polish reflects whatever Plans 2–3 actually look like, not what we predicted.

---

## Cross-cutting decisions (decide once, reference everywhere)

These need to be settled before Plan 1 starts so all four plans are consistent:

1. **License choice.** MIT (permissive, default for public-good projects) vs Apache-2.0 (explicit patent grant) vs BSL/AGPL (network-share-alike). Decision: **MIT**. Single file, no friction for users, matches Anthropic's own SDK licensing.
2. **Subscription-auth posture.** Three options: (a) remove entirely, (b) gate behind opt-in env var with stern warning, (c) keep current behavior with stronger warning. Decision: **(b)** — preserves Aman's personal use case while preventing strangers from accidentally landing on the ToS-uncertain path.
3. **Distribution channel for v1.0.** npm only, or npm + Homebrew, or npm + Homebrew + GitHub release with prebuilt binaries. Decision: **npm only for v1.0**, defer brew/binaries unless adoption demand.
4. **Default packs in TUI.** Generic-only, or all three (current). Decision: **Generic-only by default**, Support + Dev Tools opt-in. Locks in during Plan 4 but referenced in Plan 1's README rewrite.

If any of these don't match your preference, redirect before Plan 1 starts.

---

## Self-review against the goal

**Goal recap:** "anyone can install and use it perfectly."

| Goal component | Plan that ships it |
| -------------- | ------------------ |
| Anyone can install | Plan 1 (npm-publishable artifact) |
| Anyone can run | Plan 2 (in-app onboarding, no shell env vars) |
| It feels like a companion | Plan 3 (conversation memory) |
| It doesn't break in unhappy paths | Plan 4 (error UX) |
| It's legally distributable | Plan 1 (license) |
| Auth path is unambiguous | Plan 1 (subscription opt-in gate) |
| First turn works without a tutorial | Plan 2 (in-app wizard) |
| ARCHITECTURE.md is honest | Plan 1 (`:7` status fix) |

Every component of "perfect" lands in exactly one plan. No overlaps, no orphans.

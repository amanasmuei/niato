<div align="center">

# Niato

**An intent-routing agent built on the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview).**

[![npm version](https://img.shields.io/npm/v/niato.svg?color=blue)](https://www.npmjs.com/package/niato)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)](./tsconfig.json)
[![Node 20+](https://img.shields.io/badge/Node-20.6%2B-brightgreen)](#)

> *Niato* — derived from *niat* (Malay/Indonesian for *"intention"*, from the Arabic root نِيَّة). The formal declaration of intent before an act.

</div>

---

A small, fast classifier states the user's intent, an Opus orchestrator declares a plan, the right specialist subagent — drawn from a pluggable *Domain Pack* — carries it out, and guardrails declare what's about to happen before any tool runs. **Classify, plan, gate, act** — every meaningful action is preceded by a stated intent.

```
   user input
       │
       ▼
   ┌─────────────────┐
   │  classifier     │  Sonnet 4.6 — { intent, domain, confidence }
   └────────┬────────┘
            ▼
   ┌─────────────────┐
   │  orchestrator   │  Opus 4.7 — declares plan, dispatches via Agent tool
   └────────┬────────┘
            ▼
   ┌─────────────────┐
   │  specialist(s)  │  Sonnet 4.6 — minimal tool allowlist per role
   └────────┬────────┘
            ▼
        response  (+ TurnRecord: classification, tokens, cost, guardrails)
```

---

## Table of contents

- [Quick start](#quick-start) — install + first turn in 3 commands
- [Use the TUI](#use-the-tui) — terminal companion app
- [Embed in your code](#embed-in-your-code) — `createNiato({ ... })`
- [How it works](#how-it-works) — the four declarations
- [Authentication](#authentication) — API key vs. Claude subscription
- [Domain packs](#domain-packs) — what ships, how to add your own
- [Reference](#reference) — tracing, guardrails, persona, eval baselines
- [Development](#development) — clone, test, contribute
- [Roadmap & status](#roadmap--status)

---

## Quick start

Requires **Node 20.6+**. Three commands to your first turn:

```bash
# 1. Install
npm i -g niato

# 2. Authenticate (pick one)
export ANTHROPIC_API_KEY=sk-ant-...        # developer API path (recommended)

# 3. Run
niato
```

That's it. The TUI walks you through companion setup on first run — no shell env vars, no config files to edit by hand.

> **Prefer not to install globally?** `npx niato` works the same way.
>
> **Subscription auth instead of API key?** See [Authentication](#authentication) — `NIATO_AUTH=subscription` opts in (with ToS caveats).

---

## Use the TUI

After install, `niato` (or `niato tui`) launches a polished Ink terminal app:

- **Launcher** — New session · Resume last · Settings · About
- **Mode pick** — *Casual* (warm, minimal observability) · *Dev* (full per-turn trace)
- **Always-visible footer** — classify/dispatch ticks, latency, cost
- **Sessions persisted** as JSONL at `~/.niato/sessions/{id}.jsonl` (last 50 retained)

```
niato                # launcher
niato login          # OAuth subscription auth (wraps `claude /login`)
niato chat           # legacy multi-turn REPL (kept for back-compat)
niato --help         # subcommands
```

**First-run flow** (all in-app — no shell setup needed):

1. Pick auth — Claude subscription or API key.
2. If API key: paste it in the in-app prompt. Saved to `~/.niato/auth.json` (chmod 600).
3. Companion setup — name, voice archetype, optional preferences. Saved to `~/.niato/companion.json`.

**Default packs.** The TUI ships with the **Generic** pack only (Support and Dev Tools are demo packs — Support uses a stub MCP). To enable them:

```bash
export NIATO_PACKS=support,dev_tools
```

---

## Embed in your code

The package exports `createNiato(...)` as the entry-point factory. Minimal example:

```ts
import { createNiato, genericPack } from "niato";

const niato = createNiato({ packs: [genericPack] });

const turn = await niato.run("Explain how DNS works in three sentences.");
console.log(turn.result);                    // model's answer
console.log(turn.trace);                     // TurnRecord — see Reference below
console.log(niato.metrics(turn.session.id)); // rolling SessionMetrics
```

A more configured example with validators, hooks, persona, and telemetry:

```ts
import {
  createNiato,
  genericPack,
  supportPack,
  promptInjectionValidator,
  maxLengthValidator,
} from "niato";

const niato = createNiato({
  packs: [genericPack, supportPack],
  inputValidators: [maxLengthValidator(8_000), promptInjectionValidator()],
  costLimitUsd: 1.0,                  // reject further turns once session spends $1
  globalHooks: {
    // your custom org-wide PreToolUse / PostToolUse / Stop hooks
  },
  persona: {
    name: "Layla",
    description: "Warm, faith-aware. Address the user by name.",
  },
  onTurnComplete: async (trace) => {
    // pipe to OTel / Datadog / your time-series store
  },
});
```

`run()` is async, isolated per session, and propagates two typed errors callers can render directly:

| Error | Thrown when | Carries |
| ----- | ----------- | ------- |
| `NiatoInputRejectedError` | An input validator rejects the message | `reason: string` |
| `NiatoBudgetExceededError` | Session cumulative cost ≥ `costLimitUsd` | `cumulativeUsd`, `limitUsd` |
| `NiatoAuthError` | Neither auth path configured at startup | actionable message |

For non-Niato errors (network, 401, 429, malformed model output), `classifyError(err)` from `niato` returns a `ClassifiedError` with a friendly message — used by the TUI, available to library consumers.

---

## How it works

Every turn is four declarations, in order:

1. **Input validators** run synchronously over the raw message (`maxLength` on by default, `promptInjection` opt-in). First failure throws `NiatoInputRejectedError` before any tokens are spent.
2. **Cost-limit gate** checks `session.cumulativeCostUsd ≥ costLimitUsd`. Pre-turn — never mid-turn.
3. **Classifier** (Sonnet 4.6) returns `{ intent, domain, confidence }` against the loaded packs' vocabulary. Same SDK as the orchestrator, so OAuth subscription auth Just Works.
4. **Orchestrator** (Opus 4.7) reads the classification, picks the pack from `domain`, calls `pack.route(intent)` to pick the specialist, and dispatches via the SDK's `Agent` tool. The **specialist** (Sonnet 4.6) does the work using its declared tool allowlist; pack hooks gate every tool call before it executes.

After each turn, a `TurnRecord` is rebuilt from the SDK's message stream and the per-session ledger updates.

**Three architectural invariants** worth knowing:

- **The orchestrator may only dispatch via the `Agent` tool** — enforced at the SDK permission layer by the always-on `agentOnlyOrchestratorHook`. Direct `Read` / `Write` / `Bash` / MCP calls from the orchestrator are denied.
- **The classifier is out-of-band** — not a tool the orchestrator can call. It runs once before the orchestrator does.
- **Subagents do not inherit parent context** — anything a specialist needs (file paths, entities, prior decisions) is passed in the dispatch prompt.

For the full design, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Authentication

Two paths into the Anthropic API; pick whichever matches your setup. Both flow through the Agent SDK's auto-resolution.

| Path | Trigger | Cost | Use case |
| ---- | ------- | ---- | -------- |
| **API key** (default) | `ANTHROPIC_API_KEY=sk-ant-...` | per-token against your API budget | Production, CI, multi-user, anywhere a developer API key is the right call |
| **Subscription** (opt-in) | `NIATO_AUTH=subscription` + prior `claude /login` | $0 — runs against Claude Max quota | Personal, single-user, on your own machine. *Read the ToS note below.* |
| **None** | neither set | n/a | `NiatoAuthError` thrown at startup with actionable message |

`createNiato()` logs the chosen path at startup. If both are configured, `NIATO_AUTH=subscription` wins — explicit subscription opt-in overrides the API key.

<details>
<summary><strong>Note on subscription auth (read before non-personal use)</strong></summary>

The Agent SDK supports OAuth (subscription) authentication, and Niato can use it via `NIATO_AUTH=subscription`. This path is **opt-in only**: without that env var, Niato uses the developer API path or fails clearly at startup. We made this change because:

- The Agent SDK explicitly supports OAuth (`ApiKeySource = 'oauth'` in its types).
- What's *not* explicit is whether Anthropic's Consumer Terms / Acceptable Use Policy permit using your Claude Max subscription to power applications other than Claude Code itself.
- Silently defaulting strangers onto that path would push them onto a ToS-uncertain path without their knowledge.

Shape of the question:

- **Probably fine**: personal use, low volume, on your own machine. You're already paying for Max; running a personal companion through it is close to the spirit of subscription auth.
- **Verify before doing**: anything you'd put in front of customers, deploy to production, distribute to other users, or run at sustained volume. The right path for those cases is a developer API key with explicit billing.

The authoritative sources are Anthropic's [Consumer Terms](https://www.anthropic.com/legal/consumer-terms), [Acceptable Use Policy](https://www.anthropic.com/legal/aup), the Claude Max subscription agreement, and — for anything ambiguous — Anthropic support directly. Verify before scaling beyond personal use.

</details>

---

## Domain packs

A `DomainPack` is a self-contained bundle: intents, specialist `AgentDefinition`s, MCP servers, hooks, and a `route(intent) ⇒ specialist` function. Three packs ship today; the orchestrator can compose dispatches across them in a single turn.

| Pack | Intents | Specialists | MCP | Hooks |
| ---- | ------- | ----------- | --- | ----- |
| **Generic** | `question`, `task`, `escalate` | `retrieval`, `action`, `escalate` | none | none |
| **Support** | `order_status`, `refund_request`, `billing_question`, `complaint`, `account_help` | `ticket_lookup`, `refund_processor`, `kb_search`, `escalate` | in-process `support_stub` (canned responses; production swaps in real Zendesk / Stripe URLs) | `piiRedactionHook`, `dollarLimit({ tool, autoApproveBelow })` |
| **Dev Tools** | `find_code`, `explain_code`, `fix_bug`, `debug_ci` | `codebase_search`, `code_explainer`, `bug_fixer`, `ci_debugger` | none — built-in tools (`Read`, `Grep`, `Glob`, `Edit`, `Bash`, `WebFetch`) | `secretsScanHook`, `sandboxBashHook({ allowedCommands })` |

**Adding your own pack:** create `src/packs/<name>/{pack.ts, agents/, prompts/, evals/}` and export a single `DomainPack`. The Core never imports from inside a pack — only the public interface. Per-pack hooks merge into the orchestrator's `Options.hooks` after the built-in invariants and any global hooks.

<details>
<summary><strong>Cross-pack composition</strong> — when one user message spans multiple packs</summary>

When a single user message genuinely spans multiple packs (*"the refund webhook is broken — find the bug and open a ticket"*), the classifier extends its output with an optional `secondary: SecondaryIntent[]` array of additional `(intent, domain, confidence)` triples. The orchestrator surfaces these as `Additional recommendations:` in its planning prompt and decides:

- **Sequential** dispatch when one specialist's output feeds the next (e.g. `dev_tools.bug_fixer` → `support.escalate`). The orchestrator pastes the upstream output into the downstream `Agent` prompt — subagents don't share context.
- **Parallel** dispatch when the asks are independent (e.g. an order-status check + an explanation). Both `Agent` calls go out in the same assistant message; the SDK runs them concurrently.
- **Clarify** when a secondary's confidence is below the 0.85 dispatch bar — the orchestrator asks one question rather than guessing.

After every specialist returns, the orchestrator synthesizes a single answer that cites each contributing specialist.

</details>

<details>
<summary><strong>Persona (Level 1)</strong> — configurable user-facing identity layer</summary>

`persona?: { name?, description }` on `NiatoOptions` adds a configurable user-facing identity layer. The text is prepended to the orchestrator's system prompt — the orchestrator becomes the persona; specialists stay role-focused tools the persona uses. Pack brand voice (already in each specialist's `prompt.md`) keeps working unchanged.

```ts
persona: {
  name: "Layla",
  description: "Warm, faith-aware. Address the user by name. Acknowledge difficulty without minimizing.",
}
```

What Level 1 covers: a consistent voice across every turn. What it doesn't: persistent memory, time-of-day modulation, evolving rapport, per-user persona — those are Level 2 / Level 3 work.

</details>

---

## Reference

<details>
<summary><strong>TurnRecord shape</strong> — what every <code>niato.run()</code> returns</summary>

```ts
interface TurnRecord {
  sessionId: string;
  turnId: string;                                 // uuid generated per turn
  classification: IntentResult;                   // { intent, domain, confidence, secondary? }
  plan: string[];                                 // specialist names dispatched, in order
  specialists: { name: string; toolCalls: number }[];
  tokensByModel: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  }>;
  costUsd: number;                                // SDK-reported total
  latencyMs: number;                              // wall clock, includes classifier
  outcome: "success" | "error";
  guardrailsTriggered: string[];                  // tool_names denied by any hook this turn
}
```

Matches the per-turn record shape from `ARCHITECTURE.md` §11 minus cross-turn aggregation and `user_id`.

</details>

<details>
<summary><strong>SessionMetrics</strong> — rolling per-session aggregates</summary>

Read with `niato.metrics(sessionId)`:

```ts
interface SessionMetrics {
  turnCount: number;
  cumulativeCostUsd: number;
  cumulativeLatencyMs: number;
  guardrailsTriggered: Record<string, number>;       // tool_name → count
  dispatchesByPackSpecialist: Record<string, number>; // "support.refund_processor" → count
  errorCount: number;
}
```

Returns `undefined` for unknown sessions. The result is a defensive clone — mutating it does not corrupt the live ledger.

</details>

<details>
<summary><strong>Guardrails</strong> — three layers, fail-fast</summary>

| Layer | Where it runs | Failure mode |
| ----- | ------------- | ------------ |
| Input validators | Before classification | `NiatoInputRejectedError` |
| Cost-limit gate | Before classification | `NiatoBudgetExceededError` |
| SDK hooks | Around tool calls (built-in invariants → `globalHooks` → pack hooks) | SDK permission deny with reason text |

Hooks are *enforcement*, not logging. The first hook to deny halts the SDK's permission flow before the tool runs. `agentOnlyOrchestratorHook` and `mergeHooks(...layers)` are exported so you can reuse them in custom configurations.

</details>

<details>
<summary><strong>Observability</strong> — TurnRecord, SessionMetrics, onTurnComplete</summary>

Three layers, none of which require an external dependency:

**Per-turn `TurnRecord`** — the single-turn shape above. Every `niato.run()` returns it; the `info` log line includes it as a flat JSON object.

**Per-session `SessionMetrics`** — rolling aggregates updated after each turn settles. Read with `niato.metrics(sessionId)`.

**`onTurnComplete` callback** — `(trace: TurnRecord) => void | Promise<void>`. Fires after each turn's trace is built. Wire OTel / Datadog / Honeycomb / your own time-series store from here. Errors thrown by the callback are caught and logged at `warn` level; telemetry never breaks user flows.

OpenTelemetry-style distributed tracing isn't bundled — that's a per-deployment decision.

</details>

<details>
<summary><strong>Conversation memory</strong> — how prior turns persist</summary>

Niato uses the Agent SDK's built-in session management:

- First turn of a session passes `Options.sessionId = <uuid>` to the SDK.
- Subsequent turns pass `Options.resume = <uuid>` so the model sees the prior transcript.
- The SDK handles compaction automatically when context fills.
- Transcripts persist at `~/.niato/sdk-sessions/` regardless of where you launched `niato` from.

Pass the same `sessionId` to two consecutive `run()` calls and the second one resumes coherently. The TUI's "Resume Last" path uses this transparently.

</details>

<details>
<summary><strong>Eval regression baselines</strong> — CI gate against silent quality drift</summary>

Each pack ships a `baseline.json` next to its `cases.jsonl`. CI uses it to catch silent classifier-quality regressions:

```bash
pnpm eval support --baseline           # asserts current ≥ baseline; non-zero exit on regression
pnpm eval support --baseline=path.json # custom baseline path (CI artifact stores)
pnpm eval support --write-baseline     # records the current score as the new baseline
```

The check is strict: any drop in `passed` count fails. Case-count changes (i.e. someone edited `cases.jsonl`) require an explicit `--write-baseline` rather than silently passing.

</details>

---

## Development

Clone-based workflow:

```bash
git clone https://github.com/<your-fork>/niato.git
cd niato
pnpm install
cp .env.example .env       # fill in ANTHROPIC_API_KEY for E2E tests
pnpm typecheck && pnpm lint && pnpm test
pnpm dev "explain how DNS works in three sentences"
```

You'll see a structured `turn` log line (classification, dispatched specialist, tokens, cost, latency) followed by the model's answer.

**Useful scripts:**

| Command | What it does |
| ------- | ------------ |
| `pnpm dev "<prompt>"` | Single-turn, Generic pack only |
| `pnpm dev:multi "<prompt>"` | Single-turn, all packs loaded (cross-pack examples) |
| `pnpm dev:tui "<prompt>"` | Single-turn through Ink dashboard |
| `pnpm chat` | Persistent multi-turn REPL with companion persona |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint with `@typescript-eslint/recommended-strict` |
| `pnpm test` | Vitest (offline; E2E suites unskip when `ANTHROPIC_API_KEY` is set) |
| `pnpm eval <pack>` | Run a pack's golden suite |
| `pnpm build` | Production build (`dist/` + `.md` prompt copy) |

<details>
<summary><strong>Test suite layout</strong></summary>

| Suite | Path | Runs offline? |
| ----- | ---- | ------------- |
| Wiring | `tests/wiring.test.ts` | Yes |
| Classifier unit | `tests/classifier.test.ts` | Yes (Anthropic SDK mocked) |
| Orchestrator enforcement | `tests/orchestrator-enforcement.test.ts` | Yes |
| Validators | `tests/validators.test.ts` | Yes |
| Support stub MCP | `tests/support-stub.test.ts` | Yes |
| Support hooks | `tests/support-hooks.test.ts` | Yes |
| Dev Tools hooks | `tests/dev-tools-hooks.test.ts` | Yes |
| Cross-pack orchestrator | `tests/cross-pack-orchestrator.test.ts` | Yes |
| Trace guardrails extractor | `tests/trace-guardrails.test.ts` | Yes |
| Session metrics | `tests/metrics.test.ts` | Yes |
| Conversation memory | `tests/conversation-memory.test.ts` | Yes |
| Persona | `tests/persona.test.ts` | Yes |
| TUI screens (ApiKeyEntry, CompanionWizard, etc.) | `tests/cli/tui/screens/*.test.tsx` | Yes |
| Smoke (E2E) | `tests/smoke.test.ts` | No — needs `ANTHROPIC_API_KEY` |
| Support smoke (E2E) | `tests/support-smoke.test.ts` | No — three real turns, ~$0.15 |
| Dev Tools smoke (E2E) | `tests/dev-tools-smoke.test.ts` | No — three real turns, ~$0.25 |
| Cross-pack smoke (E2E) | `tests/cross-pack-smoke.test.ts` | No — one real turn |
| Cost-limit (E2E) | `tests/cost-limit-e2e.test.ts` | No — two real turns |
| Cross-pack classifier (E2E) | `tests/cross-pack-classifier.test.ts` | No — eight live cases |
| Pack evals | `tests/evals.test.ts` | No — Generic / Support / Dev Tools golden suites |

`pnpm test` picks up `ANTHROPIC_API_KEY` from `.env` automatically; the E2E suites un-skip themselves when the key is present.

</details>

<details>
<summary><strong>Repository layout</strong></summary>

```
src/
├── core/           ingress, session, classifier, orchestrator, compose
├── packs/          DomainPack interface + generic/, support/, dev-tools/
├── tools/          built-in tool name constants
├── memory/         session store
├── guardrails/     hooks, validators, errors, orchestrator-enforcement
├── observability/  log, trace
├── evals/          shared runPackEvals helper + CLI runner
├── cli/            error-classify, dispatch, TUI screens
└── index.ts        public exports
```

Conventions: TypeScript strict, one `AgentDefinition` per file, prompts longer than 30 lines in adjacent `.md` files, single typed config module that fails fast, MCP credentials referenced via env vars never literal strings. See [`CLAUDE.md`](./CLAUDE.md).

</details>

---

## Releasing

CI/CD lives in `.github/workflows/`:

- **`ci.yml`** — runs typecheck + lint + test + build on every push and PR.
- **`release.yml`** — publishes to npm with Sigstore provenance when a `vX.Y.Z` tag is pushed. Requires an `NPM_TOKEN` repo secret (granular access token, publish-only, bypass-2FA enabled).

Full setup + per-release flow in [`docs/RELEASING.md`](./docs/RELEASING.md). TL;DR for an existing setup:

```bash
# Bump version in package.json + CHANGELOG.md, commit, then:
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin master vX.Y.Z
# CI takes over: builds, validates, publishes to npm.
```

## Roadmap & status

**v1.0.0 — General Availability.** Plans 1–4 of the v1 release roadmap shipped. See [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) for the full history.

| Phase | Version | Theme |
| ----- | ------- | ----- |
| 1–9 | pre-1.0 | Skeleton → classifier → hooks → packs → cross-pack → observability → persona → OAuth → memory groundwork |
| 10 | v0.2.0 | Release prep — license, npm-publishable, NIATO_AUTH opt-in, Node bin dispatcher |
| 11 | v0.3.0 | In-app onboarding — Ink-native ApiKeyEntry + CompanionWizard |
| 12 | v0.4.0 | Conversation memory — SDK sessionId/resume threading |
| 13 | v1.0.0 | Polish — friendly errors, Generic-default packs, CHANGELOG |

**Backlog (post-1.0):**

- Eval baselines (`pnpm eval <pack> --write-baseline`) — needs API budget; CI gate is wired and waiting.
- Long-term cross-session memory — per-user KV store (Level 3 in `ARCHITECTURE.md` §9).
- TUI multi-turn history dashboard — extend `pnpm dev:tui` to a scrollable session view.
- Distributed tracing adapters — `onTurnComplete` is the integration point; OTel/Datadog adapters are per-deployment.
- `pr_creator` specialist + `protectedBranchGate` hook — needs real GitHub MCP wiring.

---

## License

[MIT](./LICENSE) · © 2026 Abdul Rahman

---

<div align="center">

*Niato declares before it acts.*

</div>

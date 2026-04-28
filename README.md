# Nawaitu

> *Nawaitu* (نَوَيْتُ) — Arabic for *"I have intended"*. The formal declaration of intent before an act.

**Nawaitu is an intent-routing agent built on the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview).** A Haiku classifier states the user's intent, an Opus orchestrator declares a plan, and the right specialist subagent — drawn from a pluggable *Domain Pack* — carries it out.

The architecture is a series of declarations before actions: **classify, plan, gate, act**. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

## At a glance

- **Two-stage routing.** Haiku 4.5 classifies intent before Opus 4.7 plans the dispatch — Opus never burns tokens on triage.
- **Pluggable domain packs.** Each pack ships its own intents, specialists, MCP tools, hooks, and evals. The shared core composes them.
- **Real guardrails.** Input validators, a cost-limit gate, and pack-scoped hooks fire *before* tool calls execute — not just as logs.
- **Auditable by default.** Every turn returns a structured `TurnRecord` with classification, dispatched specialists, tokens by model, cost, latency, and which guardrails fired. Per-session metrics roll up across turns; `onTurnComplete` plugs your own telemetry backend in.

| Layer | Model | Why |
| ----- | ----- | --- |
| Classify | Haiku 4.5 | low-latency, cacheable system prompt, structured output |
| Plan | Opus 4.7 | dispatch decisions only — never executes work directly |
| Specialist | Sonnet 4.6 | most actual work; tight tool allowlists per role |

## Quick start

Requires Node 20.6+ and pnpm.

```bash
pnpm install
cp .env.example .env       # then fill in ANTHROPIC_API_KEY
pnpm typecheck             # tsc --noEmit
pnpm lint                  # eslint
pnpm test                  # vitest (E2E suites skip without ANTHROPIC_API_KEY)
```

The CLI auto-loads `.env` via Node's `--env-file` flag, so once your key is in place you can run a single turn directly:

```bash
pnpm dev "explain how DNS works in three sentences"
```

You'll see a structured `turn` log line (classification, dispatched specialist, tokens, cost, latency) followed by the model's answer.

### Try the Support and Dev Tools packs interactively

`pnpm dev` loads the Generic pack only. To exercise the specialized packs, use the multi-pack driver — it loads every shipped pack so single-domain prompts route correctly across them:

```bash
# Support (refund, ticket, KB, escalation flows)
pnpm dev:multi "Please refund \$15 on order ORD-99 — wrong size."
pnpm dev:multi "What's the status of ticket TKT-12345?"
pnpm dev:multi "I need a \$250 refund on order ORD-9001 — never arrived."

# Dev Tools (code search, explanation, bug-fix, CI debug)
pnpm dev:multi "Where is the agentOnlyOrchestratorHook defined?"
pnpm dev:multi "Explain how the Haiku classifier handles cache misses."
pnpm dev:multi "Investigate this CI failure: /tmp/build-456.log"

# Cross-pack composition (one user message that spans multiple packs)
pnpm dev:multi "The refund webhook is broken — find the bug and open a priority ticket."
pnpm dev:multi "What's the status of order ORD-99 and explain how DNS works."
```

Two of the single-pack examples trip a hook intentionally:

- The `\$250` refund is denied by `dollarLimit({ tool, autoApproveBelow: 20 })`. The response names human approval rather than a refund ID — proof the hook fired before the tool ran.
- A bug-fix prompt that tries to run `git log` (or anything outside the test-runner allowlist) is denied by `sandboxBashHook`. The deny reason surfaces in the message stream and the specialist either reroutes or stops.

The cross-pack examples each dispatch more than one specialist in the same turn. The first does it sequentially (bug summary → ticket); the second does it in parallel (independent asks).

### Have a multi-turn chat with your companion

`pnpm chat` opens a persistent chat REPL with the persona of your choice. First run launches a guided setup wizard (companion name, your name, voice archetype, free-form description); the choice persists at `~/.nawaitu/companion.json` so subsequent runs drop straight into the chat.

```bash
$ pnpm chat
Welcome. Let's set up your companion.

Companion name: Layla
Address you as (your name, optional): Aman
Voice [warm/direct/playful] (default: warm): warm
Anything else (optional): Faith-aware, walks alongside not above.

✓ Saved to ~/.nawaitu/companion.json

Layla · session 8861e2 · ctrl-D to exit

> what is 2+2

4 (via generic.retrieval).
  ($0.04 · 18s · generic.retrieval)

>
```

Same session ID across turns — the cost ledger and `SessionMetrics` aggregate naturally. Each turn is otherwise independent (no conversation memory yet — that's the Level 3 long-term-memory ask). Pass `--reset` to re-run the wizard.

To launch as `arienz` instead of `pnpm chat`, add a one-line shell alias:

```bash
alias arienz='pnpm --silent --dir ~/Personals/nawaitu chat'
```

### Watch a turn unfold in a TUI

`pnpm dev:tui` renders the same turn through an Ink dashboard — phase progress, classifier result, dispatched specialists, per-model token usage, cost and latency — instead of a JSON log line. Single turn, exits when the run completes:

```bash
pnpm dev:tui "Please refund \$15 on order ORD-99 — wrong size."
```

### Run the golden eval suites

```bash
pnpm eval generic          # 20 cases against Haiku, ≥18 to pass
pnpm eval support          # 25 cases against Haiku, ≥22 to pass
pnpm eval dev_tools        # 25 cases against Haiku, ≥22 to pass
```

Failures print the input, expected `(domain, intent)`, and what the classifier actually returned, so you can see exactly where labels and model disagree.

## Embed in your own code

The package exports `createNawaitu(...)` as the entry-point factory:

```ts
import {
  createNawaitu,
  genericPack,
  supportPack,
  promptInjectionValidator,
  maxLengthValidator,
} from "nawaitu";

const nawaitu = createNawaitu({
  packs: [genericPack, supportPack],
  inputValidators: [maxLengthValidator(8_000), promptInjectionValidator()],
  costLimitUsd: 1.0,         // reject further turns once the session has spent $1
  globalHooks: {
    // your custom org-wide PreToolUse / PostToolUse / Stop hooks
  },
  persona: {
    name: "Layla",
    description: [
      "Warm, faith-aware companion. Walk alongside, not above.",
      "",
      "Address the user as 'you'. Acknowledge difficulty without",
      "minimizing. Avoid the word 'unfortunately'.",
    ].join("\n"),
  },
  onTurnComplete: async (trace) => {
    // pipe to OTel / Datadog / your time-series store
    await metrics.record(trace);
  },
});

const turn = await nawaitu.run("Please refund $15 on order ORD-99 — wrong size.");
console.log(turn.result);
console.log(turn.trace);     // TurnRecord — see "Tracing" below

// Rolling per-session aggregates (turn count, cumulative cost / latency,
// guardrail-trigger counts, dispatch counts, error count).
console.log(nawaitu.metrics(turn.session.id));
```

`run()` is async, isolated per session, and propagates two typed errors callers can render directly:

| Error | Thrown when | Carries |
| ----- | ----------- | ------- |
| `NawaituInputRejectedError` | An input validator rejects the message | `reason: string` |
| `NawaituBudgetExceededError` | `session.cumulativeCostUsd` already met or exceeded `costLimitUsd` | `cumulativeUsd`, `limitUsd` |

## Domain packs

A `DomainPack` is a self-contained bundle: intents, specialist `AgentDefinition`s, MCP servers, hooks, and a `route(intent) ⇒ specialist` function. Three packs ship today, and the orchestrator can compose dispatches across them in a single turn (Phase 6 — see "Cross-pack composition" below):

| Pack | Intents | Specialists | MCP | Hooks |
| ---- | ------- | ----------- | --- | ----- |
| **Generic** | `question`, `task`, `escalate` | `retrieval`, `action`, `escalate` | none — built-in tools only | none |
| **Support** | `order_status`, `refund_request`, `billing_question`, `complaint`, `account_help` | `ticket_lookup`, `refund_processor`, `kb_search`, `escalate` | in-process `support_stub` (canned responses; production swaps in real Zendesk / Stripe URLs in `pack.mcpServers`) | `piiRedactionHook` (CC/SSN deny), `dollarLimit({ tool, autoApproveBelow })` |
| **Dev Tools** | `find_code`, `explain_code`, `fix_bug`, `debug_ci` | `codebase_search`, `code_explainer`, `bug_fixer`, `ci_debugger` | none — built-in tools only (`Read`, `Grep`, `Glob`, `Edit`, `Bash`, `WebFetch`) | `secretsScanHook` (AWS/GitHub/sk- key deny), `sandboxBashHook({ allowedCommands })` (Bash limited to test runners) |

Adding your own pack: create `src/packs/<name>/{pack.ts, agents/, prompts/, evals/}` and export a single `DomainPack`. The Core never imports from inside a pack — only the public interface. Per-pack hooks merge into the orchestrator's `Options.hooks` after the built-in invariants and any global hooks.

### Persona (Level 1)

`persona?: { name?, description }` on `NawaituOptions` adds a configurable user-facing identity layer. The text is prepended to the orchestrator's system prompt — the orchestrator becomes the persona; specialists stay role-focused tools the persona uses. Pack brand voice (already in each specialist's `prompt.md`) keeps working unchanged.

```ts
persona: {
  name: "Layla",
  description: "Warm, faith-aware. Address the user by name. Acknowledge difficulty without minimizing.",
}
```

What Level 1 covers: a consistent voice across every turn. What it doesn't: persistent memory, time-of-day modulation, evolving rapport, per-user persona — those are Level 2 / Level 3 work. A configurable voice without continuity won't *feel* like a companion; it's a uniform, not a relationship.

### Cross-pack composition

When a single user message genuinely spans multiple packs ("the refund webhook is broken — find the bug and open a ticket"), the classifier extends its output with an optional `secondary: SecondaryIntent[]` array of additional `(intent, domain, confidence)` triples. The orchestrator surfaces these as `Additional recommendations:` in its planning prompt and decides:

- **Sequential** dispatch when one specialist's output feeds the next (e.g. `dev_tools.bug_fixer` → `support.escalate`). The orchestrator pastes the upstream output into the downstream `Agent` prompt — subagents don't share context.
- **Parallel** dispatch when the asks are independent (e.g. an order-status check + an explanation). Both `Agent` calls go out in the same assistant message; the SDK runs them concurrently.
- **Clarify** when a secondary's confidence is below the 0.85 dispatch bar — the orchestrator asks one question rather than guessing.

After every specialist returns, the orchestrator synthesizes a single answer that cites each contributing specialist.

## How it works

Every meaningful action is preceded by a stated intent:

1. **Input validators** run synchronously over the raw message (`maxLength` on by default, `promptInjection` opt-in). First failure throws `NawaituInputRejectedError` before any tokens are spent.
2. **Cost-limit gate** checks `session.cumulativeCostUsd ≥ costLimitUsd`. Pre-turn — never mid-turn.
3. **Classifier** (Haiku 4.5) returns `{ intent, domain, confidence }` against the loaded packs' vocabulary, with the system prompt cached for warm reuse.
4. **Orchestrator** (Opus 4.7) reads the classification, picks the pack from `domain`, calls `pack.route(intent)` to pick the specialist, and dispatches via the SDK's `Agent` tool.
5. **Specialist** (Sonnet 4.6) does the work using its declared tool allowlist. Pack hooks gate tool calls before they execute.
6. **Tracing** rebuilds a `TurnRecord` from the SDK's message stream and updates the session ledger.

Three architectural invariants worth knowing:

- **The orchestrator may only dispatch via the `Agent` tool.** Enforced at the SDK permission layer by the always-on `agentOnlyOrchestratorHook`. Direct `Read` / `Write` / `Bash` / MCP calls from the main thread are denied.
- **The classifier is out-of-band** — not a tool the orchestrator can call. It runs once per turn before the orchestrator does.
- **Subagents do not inherit parent context.** Anything a specialist needs (file paths, entities, prior decisions) is passed in the dispatch prompt.

## Guardrails

Three layers, run in this order. The first failure short-circuits the rest:

| Layer | Where it runs | Failure mode |
| ----- | ------------- | ------------ |
| Input validators | Before classification | `NawaituInputRejectedError` |
| Cost-limit gate | Before classification | `NawaituBudgetExceededError` |
| SDK hooks | Around tool calls (built-in invariants → `globalHooks` → pack hooks) | SDK permission deny with reason text |

Hooks are *enforcement*, not logging. The first hook to deny halts the SDK's permission flow before the tool runs. `agentOnlyOrchestratorHook` and `mergeHooks(...layers)` are exported so you can reuse them in custom configurations.

## Tracing

Each call to `nawaitu.run()` returns a `TurnRecord` (also logged at `info`):

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

Matches the per-turn record shape from `ARCHITECTURE.md` §11 minus cross-turn aggregation and `user_id` (added when ingress lands).

## Observability

Three layers, none of which require an external dependency:

**Per-turn `TurnRecord`** — the single-turn shape above. Every `nawaitu.run()` returns it; the `info` log line includes it as a flat JSON object.

**Per-session `SessionMetrics`** — rolling aggregates updated after each turn settles. Read with `nawaitu.metrics(sessionId)`:

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

**`onTurnComplete` callback** — `(trace: TurnRecord) => void | Promise<void>`. Fires after each turn's trace is built. Wire OTel / Datadog / Honeycomb / your own time-series store from here. Errors thrown by the callback are caught and logged at `warn` level; telemetry never breaks user flows.

OpenTelemetry-style distributed tracing isn't bundled — that's a per-deployment decision. `onTurnComplete` is the integration point.

### Eval regression baselines

Each pack ships a `baseline.json` next to its `cases.jsonl`. CI uses it to catch silent classifier-quality regressions:

```bash
pnpm eval support --baseline           # asserts current ≥ baseline; non-zero exit on regression
pnpm eval support --baseline=path.json # custom baseline path (CI artifact stores)
pnpm eval support --write-baseline     # records the current score as the new baseline
```

The check is strict: any drop in `passed` count fails. Case-count changes (i.e. someone edited `cases.jsonl`) require an explicit `--write-baseline` rather than silently passing.

## Testing

| Suite | Path | Runs offline? |
| ----- | ---- | ------------- |
| Wiring | `tests/wiring.test.ts` | Yes |
| Classifier unit | `tests/classifier.test.ts` | Yes — Anthropic SDK is `vi.mock`'d |
| Orchestrator enforcement | `tests/orchestrator-enforcement.test.ts` | Yes — pure hook callbacks |
| Validators | `tests/validators.test.ts` | Yes |
| Support stub MCP | `tests/support-stub.test.ts` | Yes — handlers called directly |
| Support hooks | `tests/support-hooks.test.ts` | Yes |
| Dev Tools hooks | `tests/dev-tools-hooks.test.ts` | Yes — pure hook callbacks |
| Cross-pack orchestrator | `tests/cross-pack-orchestrator.test.ts` | Yes — `pickAdditionalRecommendations` + `buildUserMessage` |
| Trace guardrails extractor | `tests/trace-guardrails.test.ts` | Yes — synthetic SDK result messages |
| Session metrics | `tests/metrics.test.ts` | Yes — pure aggregator + lookup |
| Eval baseline | `tests/eval-baseline.test.ts` | Yes — read/write/check helpers |
| Classifier schema | `tests/classifier-schema.test.ts` | Yes — locks `zodOutputFormat` shape against Anthropic API constraints |
| Persona | `tests/persona.test.ts` | Yes — preamble construction + orchestrator system-prompt wiring |
| Companion config | `tests/companion-config.test.ts` | Yes — load/save roundtrip + malformed/missing fallthrough |
| Persona builder | `tests/persona-builder.test.ts` | Yes — Companion → Persona composition per voice archetype |
| Smoke (E2E) | `tests/smoke.test.ts` | No — needs `ANTHROPIC_API_KEY` |
| Support smoke (E2E) | `tests/support-smoke.test.ts` | No — three real turns, ~$0.15 |
| Dev Tools smoke (E2E) | `tests/dev-tools-smoke.test.ts` | No — three real turns, ~$0.25; asserts sandbox-bash deny reason in the message stream |
| Cross-pack smoke (E2E) | `tests/cross-pack-smoke.test.ts` | No — one real turn; asserts `dev_tools.bug_fixer` → `support.escalate` dispatch order |
| Cost-limit (E2E) | `tests/cost-limit-e2e.test.ts` | No — two real turns |
| Cross-pack classifier (E2E) | `tests/cross-pack-classifier.test.ts` | No — eight live cases, ≥7/8 to pass |
| Generic + Support + Dev Tools evals | `tests/evals.test.ts` | No — ≥18/20 Generic, ≥22/25 Support, ≥22/25 Dev Tools |

`pnpm test` picks up `ANTHROPIC_API_KEY` from `.env` automatically; the E2E suites un-skip themselves when the key is present.

## Roadmap

| Phase | What shipped |
| ----- | ------------ |
| 1 | Skeleton: Generic pack + stub classifier |
| 2 | Real Haiku classifier, 20 golden eval cases, per-turn `TurnRecord` tracing |
| 3 | Hooks framework, input validators, cost-limit gate, orchestrator-restriction hook |
| 4 | Support pack: 5 intents, 4 specialists, in-process MCP stub, PII + dollar-limit hooks, 25 evals, live smoke turns |
| 5 | Dev Tools pack: 4 intents, 4 specialists, built-in tool surface, sandbox-bash + secrets-scan hooks, 25 evals, live smoke (deny-path asserted in message stream); shared `runPackEvals` helper extracted; Ink TUI driver (`pnpm dev:tui`) |
| 6 | Cross-pack composition: `IntentResult.secondary` carries cross-pack triples; orchestrator surfaces `Additional recommendations:` with per-entry confidence; `pickAdditionalRecommendations` resolves them into `<pack>.<specialist>` keys; classifier multi-domain detection evals (≥7/8); cross-pack smoke asserts `bug_fixer → escalate` dispatch order. Live verification gated on the next budget reset. |
| 7 | Observability: `guardrailsTriggered` wired from `SDKPermissionDenial`; per-session `SessionMetrics` aggregator; pluggable `onTurnComplete(trace)` callback; per-pack eval regression baselines (`--baseline` / `--write-baseline`); `nawaitu.metrics(sessionId)` lookup. |
| 8 | Cleanup: consolidated session aggregates into `metrics` (dropped duplicate `cumulativeCostUsd` / `turnCount` fields). Level 1 persona: configurable user-facing identity prepended to the orchestrator's system prompt. |

Up next:

- **Capture eval baselines** — once the API budget resets, run `pnpm eval <pack> --write-baseline` for each pack and commit the `baseline.json` files. CI then enforces no-regression.
- **TUI multi-turn history** — extend `pnpm dev:tui` from one-turn to a scrollable session view. UX scope, not observability.
- **Deferred from Phase 5**: `pr_creator` specialist + `protectedBranchGate` hook. These pair with real GitHub API + auth + remote-branch wiring — not a unit of pack architecture. Reintroduce when GitHub MCP wiring lands behind a concrete production deployment.
- **Distributed tracing** — `onTurnComplete` is the integration point. Adapters (OTel, Datadog) are a per-deployment concern, not bundled into core.

## Layout

Follows `ARCHITECTURE.md` §13:

```
src/
├── core/           ingress, session, classifier, orchestrator, compose
├── packs/          DomainPack interface + generic/, support/, dev-tools/
├── tools/          built-in tool name constants
├── memory/         session store
├── guardrails/     hooks, validators, errors, orchestrator-enforcement
├── observability/  log, trace
├── evals/          shared runPackEvals helper + CLI runner
├── cli/            shared run() loop for pnpm dev / pnpm dev:multi
└── index.ts
```

## Conventions

See [`CLAUDE.md`](./CLAUDE.md): TypeScript strict, one `AgentDefinition` per file, prompts longer than 30 lines in adjacent `.md` files, single typed config module that fails fast, MCP credentials referenced via env vars never literal strings.

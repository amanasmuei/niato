# Nawaitu

> *Nawaitu* (نَوَيْتُ) — Arabic for *"I have intended"*. The formal declaration of intent before an act.

**Nawaitu is an intent-routing agent built on the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview).** A Haiku classifier states the user's intent, an Opus orchestrator declares a plan, and the right specialist subagent — drawn from a pluggable *Domain Pack* — carries it out.

The architecture is a series of declarations before actions: **classify, plan, gate, act**. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

## At a glance

- **Two-stage routing.** Haiku 4.5 classifies intent before Opus 4.7 plans the dispatch — Opus never burns tokens on triage.
- **Pluggable domain packs.** Each pack ships its own intents, specialists, MCP tools, hooks, and evals. The shared core composes them.
- **Real guardrails.** Input validators, a cost-limit gate, and pack-scoped hooks fire *before* tool calls execute — not just as logs.
- **Auditable by default.** Every turn returns a structured `TurnRecord` with classification, dispatched specialists, tokens by model, cost, and latency.

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

### Try the Support pack interactively

`pnpm dev` loads the Generic pack only. To exercise the Support pack's flows, use the multi-pack driver:

```bash
pnpm dev:multi "Please refund \$15 on order ORD-99 — wrong size."
pnpm dev:multi "What's the status of ticket TKT-12345?"
pnpm dev:multi "How do I change my account email?"
pnpm dev:multi "I need a \$250 refund on order ORD-9001 — never arrived."
```

That last one trips the dollar-limit hook (auto-approve threshold is $20). The response will name human approval rather than a refund ID — proof the hook fired before the tool ran.

### Run the golden eval suites

```bash
pnpm eval generic          # 20 cases against Haiku, ≥18 to pass
pnpm eval support          # 25 cases against Haiku, ≥22 to pass
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
});

const turn = await nawaitu.run("Please refund $15 on order ORD-99 — wrong size.");
console.log(turn.result);
console.log(turn.trace);     // TurnRecord — see "Tracing" below
```

`run()` is async, isolated per session, and propagates two typed errors callers can render directly:

| Error | Thrown when | Carries |
| ----- | ----------- | ------- |
| `NawaituInputRejectedError` | An input validator rejects the message | `reason: string` |
| `NawaituBudgetExceededError` | `session.cumulativeCostUsd` already met or exceeded `costLimitUsd` | `cumulativeUsd`, `limitUsd` |

## Domain packs

A `DomainPack` is a self-contained bundle: intents, specialist `AgentDefinition`s, MCP servers, hooks, and a `route(intent) ⇒ specialist` function. Two packs ship today:

| Pack | Intents | Specialists | MCP | Hooks |
| ---- | ------- | ----------- | --- | ----- |
| **Generic** | `question`, `task`, `escalate` | `retrieval`, `action`, `escalate` | none — built-in tools only | none |
| **Support** | `order_status`, `refund_request`, `billing_question`, `complaint`, `account_help` | `ticket_lookup`, `refund_processor`, `kb_search`, `escalate` | in-process `support_stub` (canned responses; production swaps in real Zendesk / Stripe URLs in `pack.mcpServers`) | `piiRedactionHook` (CC/SSN deny), `dollarLimit({ tool, autoApproveBelow })` |

Adding your own pack: create `src/packs/<name>/{pack.ts, agents/, prompts/, evals/}` and export a single `DomainPack`. The Core never imports from inside a pack — only the public interface. Per-pack hooks merge into the orchestrator's `Options.hooks` after the built-in invariants and any global hooks.

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
  classification: IntentResult;                   // { intent, domain, confidence }
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
  guardrailsTriggered: string[];                  // hardcoded []; wiring deferred to Phase 7
}
```

Matches the per-turn record shape from `ARCHITECTURE.md` §11 minus cross-turn aggregation and `user_id` (added when ingress lands).

## Testing

| Suite | Path | Runs offline? |
| ----- | ---- | ------------- |
| Wiring | `tests/wiring.test.ts` | Yes |
| Classifier unit | `tests/classifier.test.ts` | Yes — Anthropic SDK is `vi.mock`'d |
| Orchestrator enforcement | `tests/orchestrator-enforcement.test.ts` | Yes — pure hook callbacks |
| Validators | `tests/validators.test.ts` | Yes |
| Support stub MCP | `tests/support-stub.test.ts` | Yes — handlers called directly |
| Support hooks | `tests/support-hooks.test.ts` | Yes |
| Smoke (E2E) | `tests/smoke.test.ts` | No — needs `ANTHROPIC_API_KEY` |
| Support smoke (E2E) | `tests/support-smoke.test.ts` | No — three real turns, ~$0.15 |
| Cost-limit (E2E) | `tests/cost-limit-e2e.test.ts` | No — two real turns |
| Generic + Support evals | `tests/evals.test.ts` | No — ≥18/20 Generic, ≥22/25 Support |

`pnpm test` picks up `ANTHROPIC_API_KEY` from `.env` automatically; the E2E suites un-skip themselves when the key is present.

## Roadmap

| Phase | What shipped |
| ----- | ------------ |
| 1 | Skeleton: Generic pack + stub classifier |
| 2 | Real Haiku classifier, 20 golden eval cases, per-turn `TurnRecord` tracing |
| 3 | Hooks framework, input validators, cost-limit gate, orchestrator-restriction hook |
| 4 | Support pack: 5 intents, 4 specialists, in-process MCP stub, PII + dollar-limit hooks, 25 evals, live smoke turns |

Up next (`ARCHITECTURE.md` §15):

- **Phase 5** — Dev Tools pack (`codebase_search`, `code_explainer`, `bug_fixer`, `pr_creator`, `ci_debugger`).
- **Phase 6** — cross-pack composition for genuinely multi-domain queries.
- **Phase 7** — observability hardening (per-pack dashboards, eval-drop alerting, `guardrailsTriggered` wiring).

## Layout

Follows `ARCHITECTURE.md` §13:

```
src/
├── core/           ingress, session, classifier, orchestrator, compose
├── packs/          DomainPack interface + generic/, support/
├── tools/          built-in tool name constants
├── memory/         session store
├── guardrails/     hooks, validators, errors, orchestrator-enforcement
├── observability/  log, trace
├── cli/            shared run() loop for pnpm dev / pnpm dev:multi
└── index.ts
```

## Conventions

See [`CLAUDE.md`](./CLAUDE.md): TypeScript strict, one `AgentDefinition` per file, prompts longer than 30 lines in adjacent `.md` files, single typed config module that fails fast, MCP credentials referenced via env vars never literal strings.

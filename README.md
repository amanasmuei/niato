# Nawaitu

> *Nawaitu* (نَوَيْتُ) — Arabic for *"I have intended"*, the formal declaration of intent before an act.

Nawaitu is a TypeScript intent-routing agent built on the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview). A Haiku classifier states the user's intent, an Opus orchestrator declares a plan, and the right specialist subagent — drawn from a pluggable Domain Pack — carries it out. The architecture is a series of declarations before actions: classify, plan, gate, then act. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

## Status

**Phase 3 — Hooks and guardrails.** The `Agent`-only orchestrator invariant is now hard-enforced at the SDK permission layer via a built-in `PreToolUse` hook. `createNawaitu` accepts user-defined `globalHooks`, every `DomainPack` can declare pack-scoped `hooks`, and the merge order is built-in invariants → globalHooks → pack hooks. Input validators (`maxLength` on by default, `promptInjection` opt-in) reject obviously bad input before it consumes tokens. A per-session cumulative `costLimitUsd` blocks further turns once the budget is exhausted. Phase 4+ ship the Support and Dev Tools packs.

## Quick start

Requires Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env       # then fill in ANTHROPIC_API_KEY
pnpm typecheck             # tsc --noEmit
pnpm lint                  # eslint
pnpm test                  # vitest (smoke + evals skip without ANTHROPIC_API_KEY)
pnpm eval generic          # run the Generic pack's golden eval suite (≥18/20 to pass)
```

Run a single turn through the CLI driver:

```bash
echo "what is 2+2" | pnpm dev
# or
pnpm dev "explain how DNS works"
```

The CLI uses the Generic pack only. To embed Nawaitu in your own code:

```ts
import {
  createNawaitu,
  genericPack,
  promptInjectionValidator,
  maxLengthValidator,
} from "nawaitu";

const nawaitu = createNawaitu({
  packs: [genericPack],
  inputValidators: [maxLengthValidator(8_000), promptInjectionValidator()],
  costLimitUsd: 1.0, // reject further turns once the session has spent $1
  globalHooks: {
    // your custom org-wide PreToolUse / PostToolUse / Stop hooks
  },
});

const turn = await nawaitu.run("explain how DNS works");
console.log(turn.result);
console.log(turn.trace); // TurnRecord — see "Tracing" below
```

## What Phase 3 delivers vs defers

| Area              | Phase 3 |
| ----------------- | ------- |
| Orchestrator      | Opus 4.7. **`Agent`-only dispatch is now hard-enforced** by a built-in `PreToolUse` hook (`agentOnlyOrchestratorHook`) that denies any non-`Agent` call from the main thread. The hook is always-on; there is no opt-out for an architectural invariant. |
| Hooks framework   | `globalHooks` on `createNawaitu` and `pack.hooks` on every `DomainPack`. Merged into `Options.hooks` in order: built-in invariants → globalHooks → each pack's hooks. The first hook to deny short-circuits the SDK's permission flow. |
| Input validators  | `maxLengthValidator(32_000)` runs by default. `promptInjectionValidator()` is opt-in (false-positive risk varies by domain). First failure throws `NawaituInputRejectedError` before classification. |
| Cost limit        | `costLimitUsd` on `createNawaitu`. Pre-turn gate: if `session.cumulativeCostUsd ≥ limit`, throws `NawaituBudgetExceededError`. Mid-turn throttling deferred to Phase 7 (the SDK doesn't currently expose per-tool-call cost estimation). |
| Classifier        | Real Haiku 4.5 with prompt caching + tool-based structured output (Phase 2). |
| Generic pack      | Retrieval / action / escalate specialists, 20 golden eval cases (Phase 2). |
| Tracing           | Per-turn `TurnRecord` (Phase 2). |
| Support / Dev Tools | Deferred (Phase 4+). |
| Memory            | In-memory session map with `cumulativeCostUsd`. Long-term store and skills loader come later. |
| MCP servers       | None loaded. Built-in SDK tools only. |
| Cost dashboards / OTel tracing | Phase 7. The `costUsd` field is populated per turn but not aggregated. |

## Guardrails

Three layers, run in this order:

1. **Input validators** — synchronous predicates over the raw user message, run before classification. The default chain is `[maxLengthValidator(32_000)]`; pass `inputValidators: []` to disable, or compose your own. Failures throw `NawaituInputRejectedError` (carries a `reason` string for clean user-facing surfacing).
2. **Cost-limit gate** — pre-turn check on `session.cumulativeCostUsd`. Throws `NawaituBudgetExceededError` (carries `cumulativeUsd` + `limitUsd`).
3. **SDK hooks** — built-in invariants (orchestrator-restriction) → `globalHooks` → per-pack `hooks`. Hooks fire around tool calls inside the agent loop. The first deny short-circuits the SDK's permission flow.

The orchestrator-restriction hook is exported as `agentOnlyOrchestratorHook` so callers can reuse it in custom configurations. `mergeHooks(...layers)` is also exported for composing hook layers.

## Tracing

Each call to `nawaitu.run()` returns a `TurnRecord` (also logged at `info`):

```ts
interface TurnRecord {
  sessionId: string;
  turnId: string;                                 // uuid generated per turn
  classification: IntentResult;                   // { intent, domain, confidence, urgency? }
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
  guardrailsTriggered: string[];                  // populated by hook outputs in Phase 4+
}
```

Matches the per-turn record shape from `ARCHITECTURE.md` §11 minus `cost_usd`'s aggregation and `user_id` (added when ingress lands).

## Tests and evals

| Suite | Path | Runs without API key? |
| ----- | ---- | --------------------- |
| Wiring | `tests/wiring.test.ts` | Yes — assembly assertions only |
| Classifier unit | `tests/classifier.test.ts` | Yes — Anthropic SDK is `vi.mock`'d |
| Orchestrator enforcement | `tests/orchestrator-enforcement.test.ts` | Yes — pure hook callback |
| Validators | `tests/validators.test.ts` | Yes — pure functions |
| Smoke (E2E) | `tests/smoke.test.ts` | **No** — skipped without `ANTHROPIC_API_KEY` |
| Generic evals | `tests/evals.test.ts` | **No** — skipped without `ANTHROPIC_API_KEY`; ≥18/20 to pass |

Run with a real key:

```bash
ANTHROPIC_API_KEY=sk-ant-… pnpm test
ANTHROPIC_API_KEY=sk-ant-… pnpm eval generic
```

## Layout

Follows `ARCHITECTURE.md` §13. Phase 3 adds `src/guardrails/{orchestrator-enforcement.ts,validators.ts,errors.ts}` and extends `src/guardrails/hooks.ts` with `mergeHooks`.

## Conventions

See [`CLAUDE.md`](./CLAUDE.md) for the project conventions (TypeScript strict, one `AgentDefinition` per file, prompts longer than 30 lines in adjacent `.md` files, single typed config module that fails fast).

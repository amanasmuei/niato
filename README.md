# Nawaitu

> *Nawaitu* (نَوَيْتُ) — Arabic for *"I have intended"*, the formal declaration of intent before an act.

Nawaitu is a TypeScript intent-routing agent built on the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview). A Haiku classifier states the user's intent, an Opus orchestrator declares a plan, and the right specialist subagent — drawn from a pluggable Domain Pack — carries it out. The architecture is a series of declarations before actions: classify, plan, gate, then act. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

## Status

**Phase 2 — Real classifier, evals, tracing.** The stub classifier has been replaced with a real Haiku 4.5 call (prompt caching + tool-based structured output). The Generic pack ships with 20 golden eval cases and a runner. Each turn emits a structured `TurnRecord` with classification, plan, per-specialist tool-call counts, per-model token usage, cost in USD, latency, and outcome. Phase 3 wires up the hooks/guardrails layer; Phase 4+ ship the Support and Dev Tools packs.

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
import { createNawaitu, genericPack } from "nawaitu";

const nawaitu = createNawaitu({ packs: [genericPack] });
const turn = await nawaitu.run("explain how DNS works");
console.log(turn.result);
console.log(turn.trace); // TurnRecord — see "Tracing" below
```

## What Phase 2 delivers vs defers

| Area              | Phase 2 |
| ----------------- | ------- |
| Classifier        | **Real Haiku 4.5.** Tool-based structured output via `messages.parse()`; prompt caching enabled on the system prompt. Stub stays exported for tests that need to stay offline. |
| Orchestrator      | Opus 4.7 with `Agent`-only dispatch (soft enforcement via system prompt; Phase 3 hardens via a `PreToolUse` hook). |
| Generic pack      | Retrieval / action / escalate specialists per `ARCHITECTURE.md` §7.1, plus 20 golden eval cases (8 questions, 6 tasks, 3 escalations, 3 boundary). |
| Tracing           | Per-turn `TurnRecord` with classification, plan, per-specialist tool-call counts, per-model token usage, cost in USD, latency, outcome. Logged at `info`. |
| Eval runner       | `pnpm eval generic` exits non-zero below ≥18/20 pass rate. Multi-pack runner deferred. |
| Support / Dev Tools | Deferred (Phase 4+). |
| Hooks framework   | Type placeholder only; not yet wired into the orchestrator. |
| Memory            | In-memory session map. Long-term store and skills loader come later. |
| MCP servers       | None loaded. Built-in SDK tools only. |
| Cost dashboards / OTel tracing | Phase 7. The `costUsd` field is populated per turn but not aggregated. |

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
  guardrailsTriggered: string[];                  // empty until Phase 3
}
```

Match the per-turn record shape from `ARCHITECTURE.md` §11 minus `cost_usd`'s aggregation and `user_id` (added when ingress lands).

## Tests and evals

| Suite | Path | Runs without API key? |
| ----- | ---- | --------------------- |
| Wiring | `tests/wiring.test.ts` | Yes — assembly assertions only |
| Classifier unit | `tests/classifier.test.ts` | Yes — Anthropic SDK is `vi.mock`'d |
| Smoke (E2E) | `tests/smoke.test.ts` | **No** — skipped without `ANTHROPIC_API_KEY` |
| Generic evals | `tests/evals.test.ts` | **No** — skipped without `ANTHROPIC_API_KEY`; ≥18/20 to pass |

Run with a real key:

```bash
ANTHROPIC_API_KEY=sk-ant-… pnpm test
ANTHROPIC_API_KEY=sk-ant-… pnpm eval generic
```

## Layout

Follows `ARCHITECTURE.md` §13. Phase 2 adds `src/core/classifier/{prompt.md,prompt.ts,haiku.ts}`, `src/observability/trace.ts`, `src/packs/generic/evals/`, and `src/evals/runner.ts`.

## Conventions

See [`CLAUDE.md`](./CLAUDE.md) for the project conventions (TypeScript strict, one `AgentDefinition` per file, prompts longer than 30 lines in adjacent `.md` files, single typed config module that fails fast).

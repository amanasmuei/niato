# Nawaitu

> *Nawaitu* (نَوَيْتُ) — Arabic for *"I have intended"*, the formal declaration of intent before an act.

Nawaitu is a TypeScript intent-routing agent built on the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview). A Haiku classifier states the user's intent, an Opus orchestrator declares a plan, and the right specialist subagent — drawn from a pluggable Domain Pack — carries it out. The architecture is a series of declarations before actions: classify, plan, gate, then act. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

## Status

**Phase 1 — Skeleton.** The full intent-routing loop is wired end-to-end with a stub classifier (always returns `{generic, question, 0.95}`) and the Generic pack's three specialists (retrieval, action, escalate). Phase 2 adds the real Haiku 4.5 classifier; Phase 3 adds the hooks/guardrails layer; Phase 4+ ship the Support and Dev Tools packs.

## Quick start

Requires Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env       # then fill in ANTHROPIC_API_KEY
pnpm typecheck             # tsc --noEmit
pnpm lint                  # eslint
pnpm test                  # vitest (smoke test skips without ANTHROPIC_API_KEY)
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
```

## What Phase 1 delivers vs defers

| Area              | Phase 1 |
| ----------------- | ------- |
| Classifier        | **Stub** — hardcoded `(generic, question, 0.95)`. Real Haiku call comes in Phase 2. |
| Orchestrator      | Opus 4.7 with `Agent`-only dispatch (soft enforcement via system prompt; Phase 3 hardens via a `PreToolUse` hook). |
| Generic pack      | Retrieval / action / escalate specialists, tool allowlists per `ARCHITECTURE.md` §7.1. |
| Support / Dev Tools | Deferred (Phase 4+). |
| Hooks framework   | Type placeholder only; not wired into the orchestrator. |
| Memory            | In-memory session map. Long-term store and skills loader come later. |
| Observability     | Console JSON logger only. Tracing / cost accounting in Phase 7. |
| MCP servers       | None loaded. Built-in SDK tools only. |
| Evals             | Deferred to Phase 2 (the first pack ships with 20 golden cases then). |

## Smoke test

`tests/smoke.test.ts` sends `"what is 2+2"` through the full loop and asserts a `tool_use` block with `name: "Agent"` and `subagent_type: "generic.retrieval"` appears in the message stream. It costs a small number of tokens against the real API and is **skipped automatically when `ANTHROPIC_API_KEY` is unset**, so CI without a key stays green via the offline `tests/wiring.test.ts` suite.

To run it locally:

```bash
ANTHROPIC_API_KEY=sk-ant-… pnpm test
```

## Layout

Follows `ARCHITECTURE.md` §13. Phase 1 fills `src/core/`, `src/packs/generic/`, and minimal placeholders under `src/guardrails/`, `src/memory/`, and `src/observability/`.

## Conventions

See [`CLAUDE.md`](./CLAUDE.md) for the project conventions (TypeScript strict, one `AgentDefinition` per file, prompts longer than 30 lines in adjacent `.md` files, single typed config module that fails fast).

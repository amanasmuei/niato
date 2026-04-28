# Nawaitu

> *Nawaitu* (نَوَيْتُ) — Arabic for *"I have intended"*, the formal declaration of intent before an act.

Nawaitu is a TypeScript intent-routing agent built on the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview). A Haiku classifier states the user's intent, an Opus orchestrator declares a plan, and the right specialist subagent — drawn from a pluggable Domain Pack — carries it out. The architecture is a series of declarations before actions: classify, plan, gate, then act. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

## Status

**Phase 4 — Support pack.** The first specialized `DomainPack` ships end-to-end: five intents (`order_status`, `refund_request`, `billing_question`, `complaint`, `account_help`) routed to four specialists (`ticket_lookup`, `refund_processor`, `kb_search`, `escalate`). An in-process MCP server (`support_stub`) exposes the four canned tools the specialists need; a real production deployment swaps the stub for real Zendesk / Stripe servers in `pack.mcpServers`. The pack registers two PreToolUse hooks: `piiRedactionHook` (denies tool calls whose input matches a Luhn-valid credit-card or US-SSN pattern) and a `dollarLimit` factory (used once for `issue_refund` with the $20 auto-approve threshold from `ARCHITECTURE.md` §7.2). 25 golden eval cases (≥22/25 to pass) and three live smoke turns (order-status dispatch, sub-threshold refund, denied refund) verify the loop end-to-end. Phase 5+ ship the Dev Tools pack and cross-pack composition.

## Quick start

Requires Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env       # then fill in ANTHROPIC_API_KEY
pnpm typecheck             # tsc --noEmit
pnpm lint                  # eslint
pnpm test                  # vitest (smoke + evals skip without ANTHROPIC_API_KEY)
pnpm eval generic          # run the Generic pack's golden eval suite (≥18/20 to pass)
pnpm eval support          # run the Support pack's golden eval suite (≥22/25 to pass)
```

Run a single turn through the CLI driver:

```bash
echo "what is 2+2" | pnpm dev
# or
pnpm dev "explain how DNS works"
```

The CLI uses the Generic pack only (cross-pack composition lands in Phase 6). To embed Nawaitu with multiple packs:

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
  costLimitUsd: 1.0, // reject further turns once the session has spent $1
  globalHooks: {
    // your custom org-wide PreToolUse / PostToolUse / Stop hooks
  },
});

const turn = await nawaitu.run("Please refund $15 on order ORD-99 — wrong size.");
console.log(turn.result);
console.log(turn.trace); // TurnRecord — see "Tracing" below
```

## What Phase 4 delivers vs defers

| Area              | Phase 4 |
| ----------------- | ------- |
| Support pack      | 5 intents → 4 specialists, MCP-tool-only allowlist (no `Read`/`Bash`/network), prompts in adjacent `.md` files, hooks wired (`piiRedactionHook` + `dollarLimit({ tool, autoApproveBelow })`), 25 golden eval cases (≥22/25), three live smoke scenarios. |
| MCP servers       | In-process `support_stub` server with four canned-response tools (`lookup_ticket`, `search_kb`, `issue_refund`, `create_priority_ticket`). Production swaps it for real Zendesk / Stripe by replacing `pack.mcpServers`. |
| Pack hooks        | `DomainPack.hooks` is now exercised. `piiRedactionHook` denies on Luhn-valid CC or US-SSN patterns in `tool_input`. `dollarLimit({ tool, autoApproveBelow })` is a factory returning a `HookCallbackMatcher` scoped to a single tool name. |
| Skills            | **Deferred.** `AgentDefinition.skills` requires filesystem skill discovery, which requires `settingSources` to include `'project'` / `'user'`. Our orchestrator runs with `settingSources: []` per the architectural invariant in `CLAUDE.md`. Skill content is rolled into specialist prompts inline; reintroducing a skills loader is a Phase 5+ design question. |
| Orchestrator      | Opus 4.7. The built-in `agentOnlyOrchestratorHook` (Phase 3) holds: a Phase 4 regression test confirms it denies a synthetic main-thread call to `mcp__support_stub__issue_refund`. Pack-contributed `mcpServers` flow through `mergePackMcpServers` into the SDK's top-level `Options.mcpServers`. |
| Cross-pack        | **Deferred to Phase 6.** Calling `createNawaitu({ packs: [genericPack, supportPack] })` works (the wiring tests confirm), but the orchestrator's behavior under multi-domain queries is not validated end-to-end yet. |
| Hooks framework   | `globalHooks` on `createNawaitu` and `pack.hooks` on every `DomainPack`. Merged into `Options.hooks` in order: built-in invariants → globalHooks → each pack's hooks. The first hook to deny short-circuits the SDK's permission flow. |
| Input validators  | `maxLengthValidator(32_000)` runs by default. `promptInjectionValidator()` is opt-in (false-positive risk varies by domain). First failure throws `NawaituInputRejectedError` before classification. |
| Cost limit        | `costLimitUsd` on `createNawaitu`. Pre-turn gate: if `session.cumulativeCostUsd ≥ limit`, throws `NawaituBudgetExceededError`. Mid-turn throttling deferred to Phase 7. |
| Cost dashboards / OTel tracing | Phase 7. The `costUsd` field is populated per turn but not aggregated. |
| Dev Tools pack    | Deferred to Phase 5. |

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
  guardrailsTriggered: string[];                  // hardcoded []; wiring deferred to Phase 7 observability
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
| Support stub MCP | `tests/support-stub.test.ts` | Yes — handlers called directly |
| Support hooks | `tests/support-hooks.test.ts` | Yes — pure hook callbacks |
| Smoke (E2E) | `tests/smoke.test.ts` | **No** — skipped without `ANTHROPIC_API_KEY` |
| Support smoke (E2E) | `tests/support-smoke.test.ts` | **No** — skipped; three real Support turns (~$0.15) |
| Cost-limit (E2E) | `tests/cost-limit-e2e.test.ts` | **No** — skipped; runs two real turns |
| Generic + Support evals | `tests/evals.test.ts` | **No** — skipped; ≥18/20 Generic, ≥22/25 Support |

Run with a real key:

```bash
ANTHROPIC_API_KEY=sk-ant-… pnpm test
ANTHROPIC_API_KEY=sk-ant-… pnpm eval generic
ANTHROPIC_API_KEY=sk-ant-… pnpm eval support
```

## Layout

Follows `ARCHITECTURE.md` §13. Phase 4 adds `src/packs/support/` (pack module with `agents/`, `prompts/`, `tools/`, `hooks/`, `evals/`) and extends the orchestrator with `mergePackMcpServers` so `DomainPack.mcpServers` flows into `Options.mcpServers`.

## Conventions

See [`CLAUDE.md`](./CLAUDE.md) for the project conventions (TypeScript strict, one `AgentDefinition` per file, prompts longer than 30 lines in adjacent `.md` files, single typed config module that fails fast).

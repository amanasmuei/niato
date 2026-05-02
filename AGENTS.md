# Project: Niato

> *Niato* — derived from *niat* (Malay/Indonesian for *"intention"*, from the Arabic root نِيَّة). The formal declaration of intent before an act.
>
> An intent-routing agent built on the Codex Agent SDK. Every meaningful action is preceded by a stated intent: classify, plan, approve, act.

Read `ARCHITECTURE.md` for the full design.

## What this project is

A TypeScript service that classifies user intent, dispatches to specialist subagents through the Codex Agent SDK, and returns structured responses. The architecture is **shared core + pluggable Domain Packs** so the same engine serves multiple domains (Support, Dev Tools, Generic) — separately or composed.

## Stack

- **Runtime:** Node 20+, TypeScript strict mode
- **Package manager:** pnpm
- **SDK:** `@anthropic-ai/Codex-agent-sdk` (pin a version, do not use `latest`)
- **Validation:** zod at every trust boundary (HTTP, MCP, hook payloads)
- **Test:** vitest
- **Lint:** eslint with `@typescript-eslint/recommended-strict`
- **Models:** Haiku 4.5 (classifier), Opus 4.7 (orchestrator), Sonnet 4.6 (specialists)

## Repository layout

Follow §13 of `ARCHITECTURE.md` exactly. Don't invent new top-level directories. New code goes inside `src/core/`, `src/packs/<pack>/`, `src/tools/`, `src/memory/`, `src/guardrails/`, or `src/observability/`.

The package is published as `niato`. The entry-point factory is `createNiato(...)`.

## Coding conventions

- TypeScript strict mode. No `any`. No `as` casts without an inline comment explaining why.
- One `AgentDefinition` per file. File name matches the specialist name in snake_case.
- Prompts longer than 30 lines live in adjacent `.md` files, imported as strings.
- All MCP URLs and credentials referenced via env vars or vault paths. Never literal strings in code.
- All prompts are versioned in git. Never load prompts from a database at runtime.
- Public exports from a pack go through `src/packs/<pack>/index.ts`. The Core never imports from inside a pack — only the pack's public interface.
- Each pack exports a single default `DomainPack` object.

## Architectural invariants (do not violate without discussion)

1. **The orchestrator's `allowedTools` is `["Agent"]`.** It can only dispatch specialists, never execute work itself. Adding `Read`, `Write`, `Bash`, etc. to the orchestrator is a regression.
2. **The classifier is out-of-band.** It is not a tool the orchestrator calls. It runs before the orchestrator and its result is passed in via the first user message or system prompt.
3. **Confidence policy.** `>= 0.85` dispatch directly. `0.6–0.85` dispatch with verification or one clarifier. `< 0.6` ask the user, do not dispatch.
4. **Subagents do not inherit parent context.** Anything a specialist needs (file paths, entities, prior decisions) must be in the prompt string passed to the `Agent` tool.
5. **Hooks are enforcement, not logging.** A `preToolUse` hook returning `{ action: "block" }` actually blocks. Logging hooks should sit alongside, not replace, enforcement.
6. **Specialists in a pack have minimum-viable tool allowlists.** If a specialist doesn't need `Bash`, it doesn't get `Bash`.
7. **Declare before act.** Niato's core philosophy: classifier states intent, orchestrator states plan, guardrails state what's about to happen — then the system acts. Do not introduce code paths that act without declaring.

## Testing

- Every pack has an `evals/` directory with at least 20 golden test cases by the time it ships.
- `pnpm test` runs unit + integration tests.
- `pnpm eval <pack>` runs the pack's eval suite.
- Don't merge with failing typecheck, lint, or tests.

## Workflow

- Always run in plan mode for new features. Propose, get approval, execute.
- Commit after each meaningful chunk so we have clean revert points.
- After completing a step, briefly state what was done and what's next.
- If a design decision isn't covered in `ARCHITECTURE.md`, **stop and ask** rather than choosing.
- Before declaring a task done: `pnpm typecheck && pnpm lint && pnpm test`.

## What to NOT do

- Don't add a fourth domain pack until the first three are stable.
- Don't add observability tooling beyond console logs in Phase 1–2. Real tracing comes in Phase 7.
- Don't load real credentials or MCP servers in tests. Use stub adapters.
- Don't create new top-level directories without discussion.
- Don't change the architectural invariants in this file or in `ARCHITECTURE.md` without flagging the change explicitly.
- Don't auto-load `.Codex/` settings (`settingSources: []` in the orchestrator) unless we explicitly opt in.

## Useful commands

```
pnpm install              # install deps
pnpm dev                  # run Niato locally with a CLI driver
pnpm typecheck            # tsc --noEmit
pnpm lint                 # eslint
pnpm test                 # vitest
pnpm eval <pack>          # run a pack's eval suite
pnpm build                # production build
```

## When in doubt

`ARCHITECTURE.md` is the source of truth. If this file disagrees with `ARCHITECTURE.md`, fix this file. If the architecture itself needs to change, that's a separate explicit conversation, not a silent edit.

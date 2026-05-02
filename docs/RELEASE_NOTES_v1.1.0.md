# Niato v1.1.0 — four post-1.0 backlog items ship

The README's post-1.0 backlog is mostly cleared. Four features shipped in one release; all additive — no breaking changes.

## What's new

### 1. `pr_creator` specialist + `protectedBranchGate` hook (dev-tools pack)

The last unimplemented promise from `ARCHITECTURE.md` §7.3. Open PRs through the orchestrator with branch-protection guardrails baked in.

```ts
// "Open a PR for the OAuth fix from feat/oauth to develop"
//   → classifier picks intent: create_pr, domain: dev_tools
//   → orchestrator dispatches dev_tools.pr_creator
//   → protectedBranchGate sees base="develop" — allow
//   → MCP create_pull_request returns the PR URL
```

The MCP layer is currently a stub (`dev_tools_github_stub`, mirroring `support_stub`). Wiring real GitHub MCP is the only item left in the post-1.0 backlog — deferred to a follow-up.

`protectedBranchGate({ allowedBranches? })` denies PRs targeting `main`, `master`, or `^release/` by default. Override the set per pack instantiation. Deny-with-reason surfaces to the orchestrator, which replans (e.g. dispatches `escalate` or asks a clarifier).

### 2. Long-term cross-session memory (file-based default)

ARCHITECTURE.md §9 named Redis/DynamoDB/Postgres as the long-term tier; v1.1 ships a simpler **file-based default** with a thin `MemoryStore` interface for plugging in those backends later.

```ts
import { createNiato, FileMemoryStore } from "@aman_asmuei/niato";

const niato = createNiato({
  packs: [genericPack],
  memory: { /* uses FileMemoryStore at ~/.niato/memory/default.json */ },
});

await niato.remember(["User prefers TypeScript strict mode."]);
// Future turns inject this fact into the orchestrator system prompt.
```

- **Architectural invariant #4 preserved**: specialists never see memory. Only the orchestrator does. Enforced by a structural test.
- **Soft cap**: 100 facts / ~4KB. Overflow truncates oldest + emits a warn log — operational signal, not a programming error.
- **Auto-extraction is intentionally deferred** to v1.x. Explicit `remember()` only for now — needs its own prompt + golden tests + product question about what counts as a long-term fact.
- **New env var**: `NIATO_USER_ID` (defaults to `"default"`). One Niato instance is one user.
- Composition order in the orchestrator system prompt: `persona → memory → ORCHESTRATOR_PROMPT`.

### 3. TUI multi-turn history dashboard

New screen in the launcher between "Resume last" and "Settings". Reads from the existing JSONL session storage at `~/.niato/sessions/`. No new dependencies; manual windowed scroll via Ink's `useInput` for ↑/↓ navigation.

Per-row: timestamp, intent + domain + confidence, dispatched specialist, cost, latency, outcome glyph.

### 4. OpenTelemetry adapter (docs only)

A copy-paste recipe, not a bundled adapter. Why: `TurnRecord` is already the public contract; the mapping is mechanical; bundling OTel as a peer-dep would force every consumer to install it.

```ts
// Drop docs/otel-adapter.ts into your project, then:
const niato = createNiato({
  packs,
  onTurnComplete: (trace) => niatoToOtelSpan(trace, tracer),
});
```

`docs/otel-adapter.md` has the full mapping table and prereqs. **Datadog is covered by the same code** via DD's OTel receiver — no DD-specific adapter needed.

## Small but useful

- `TurnRecord.startedAt` (ISO 8601) is now part of the public trace shape — accurate wall-clock start for OTel spans.
- `Niato` interface gains `remember(facts: string[]): Promise<void>` when `memory` is configured (no-op when memory is omitted — backward compatible).
- README's post-1.0 backlog shrank from five items to one; `Shipped (post-1.0)` section lists what landed.

## What's NOT changed

- No breaking changes. Existing `createNiato({ packs })` calls work identically.
- No new dependencies in the npm package.
- API-key auth path behaves exactly as before.
- All v1.0.4 eval baselines still hold; `dev_tools` rebaselined to include the 5 new `create_pr` cases.

## Acknowledgements

Implemented via four parallel sub-agent dispatches (one per feature) with worktree isolation. Each agent: spec → plan → implementation → tests → typecheck/lint/test verification → commit. Merged into main via cherry-pick with manual conflict resolution on shared files (`README.md`, `compose.ts`).

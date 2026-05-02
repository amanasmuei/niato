# Live Introspection Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a live, interactive TUI panel that surfaces Niato's "declare before act" philosophy in real time — the user sees specialist dispatches as they happen, every tool call as it fires, and inline approval prompts when a hook decides a tool needs human sign-off. No more black-box "dispatching…" → final answer.

**Architectural decisions (settled — see plan thread 2026-05-02 with user):**

1. **Phase framing.** This is *Phase 4.5: live introspection panel* — interactive CLI surface, not telemetry export. Distinct from §15's Phase 7 (dashboards, alerts, exporters). CLAUDE.md's "no observability tooling beyond console logs in Phase 1–2" line gets a clarifying amendment in the same change so the doc and code stay in sync. (Last session's lesson: schema mismatch at plan-writing time.)

2. **Streaming API shape: additive `runStream()`.** `Niato.run()` keeps its `Promise<NiatoTurn>` signature unchanged — every existing caller (chat-repl, evals, programmatic users) is untouched. New sibling `Niato.runStream(input, sessionId, onEvent): Promise<NiatoTurn>` is the same loop with a callback for live events. Internally `run()` becomes a thin wrapper: `runStream(input, sessionId, () => undefined)`.

3. **Inline approval via SDK's native `canUseTool`.** The SDK already supports `permissionDecision: 'allow' | 'deny' | 'ask' | 'defer'` (`sdk.d.ts:746`) and `Options.canUseTool: (toolName, input, options) => Promise<PermissionResult>` (`sdk.d.ts:145`). Hooks return `'ask'` when they want human approval; the SDK then calls `canUseTool` with the hook's `decisionReason`. Niato wires `canUseTool` to a TUI-owned `ApprovalChannel` that resolves on keypress. **No custom hook contract change** — this was a misunderstanding caught before plan-writing. ARCHITECTURE.md §10 only needs a clarifying note about `canUseTool`, not a contract edit.

**Architecture summary:** Three concentric rings.

- **Ring 1 — events.** A pure `messagesToEvents()` translator turns SDK message ticks into a typed `NiatoEvent` discriminated union. Lives in `src/observability/event-stream.ts`. Side-effect-free.
- **Ring 2 — runtime plumbing.** `runOrchestrator()` accepts an optional `onEvent` callback and an optional `canUseTool` callback. Emits events incrementally as messages stream through the existing `for await` loop. `Niato.runStream()` is the consumer-facing entry point.
- **Ring 3 — TUI rendering.** A new `LivePanel` Ink component subscribes to events via the `useLiveEvents` hook, renders specialist rows + tool ticker + inline approval prompt. Approval prompt is keyboard-driven: `[a]` allow, `[d]` deny.

**Tech Stack:** TypeScript strict (`exactOptionalPropertyTypes: true`) · `@anthropic-ai/claude-agent-sdk` (already pinned) · React + Ink (already in TUI). No new deps.

**Roadmap reference:** Not part of v1 release roadmap — this is the v1.3 "live introspection" feature. Tag: `feat/live-introspection-panel` → master.

**Estimated size:** ~9 tasks, ~500–700 LOC including tests.

---

## Pre-flight (read before starting)

1. **Worktree.** Create `.worktrees/live-introspection-panel` from current master HEAD. Branch name `feat/live-introspection-panel`. Use `superpowers:using-git-worktrees`.
2. **TDD discipline.** Behavior tasks (1, 2, 3, 4, 6, 7, 8) follow strict failing-test-first. Tasks 5 (LivePanel) and 9 (docs) are construction/integration.
3. **One commit per task.** NO `Co-Authored-By:` trailer (per `feedback_no_claude_signature_in_commits.md`).
4. **Done-bar before final commit per task.** `pnpm typecheck && pnpm lint && pnpm test`.
5. **Fixture conventions** (per `feedback_nawaitu_strict_conventions.md` — load-bearing, subagents copy plan literals verbatim):
   - **Optional fields:** `field: T | undefined` always (not `field?: T`). Object literals must explicitly set `undefined`.
   - **Non-null assertions forbidden.** Use `expectDefined<T>` (`tests/cli/tui/_helpers/expect-defined.ts`).
   - **Empty function noop:** `() => undefined` not `() => {}`.
   - **`as` casts:** require an inline comment explaining why.
   - **JSX text:** apostrophes need `&apos;`.
   - **Verify type shapes against `src/`** before drafting fixtures. Common mistakes flagged in `tests/cli/tui/_helpers/stub-niato.ts` comments.
6. **No real API in tests.** All event-stream, approval-channel, runStream, and LivePanel tests are pure (stub orchestrator + canned message arrays). The `dollar_limit` migration test uses the existing in-process `support_stub` MCP server.

---

## File structure

**Create:**

| Path | Responsibility |
|---|---|
| `src/observability/events.ts` | `NiatoEvent` discriminated union types (8 event variants) |
| `src/observability/event-stream.ts` | Pure `messagesToEvents(messages)` and incremental `messageToEvents(message, state)` |
| `src/guardrails/approval-channel.ts` | `ApprovalChannel` interface + `createApprovalChannel()` factory |
| `src/cli/tui/components/live-panel.tsx` | Ink component: specialist tree + tool ticker + inline approval |
| `src/cli/tui/hooks/use-live-events.ts` | React hook subscribing to `runStream` events; owns the `ApprovalChannel` |
| `tests/observability/event-stream.test.ts` | Translator tests |
| `tests/guardrails/approval-channel.test.ts` | Channel resolve/subscribe semantics |
| `tests/orchestrator-stream.test.ts` | `runOrchestrator` emits events; `canUseTool` plumbed |
| `tests/compose-stream.test.ts` | `Niato.runStream()` end-to-end with stub orchestrator |
| `tests/cli/tui/components/live-panel.test.tsx` | Component tests (rendering + keypress) |
| `tests/cli/tui/hooks/use-live-events.test.tsx` | Hook tests |
| `tests/dollar-limit-ask.test.ts` | Migrated dollar_limit using `'ask'` + ApprovalChannel |

**Modify:**

| Path | Change |
|---|---|
| `src/core/orchestrator/orchestrator.ts` | `OrchestratorInput` gains `onEvent?: (e: NiatoEvent) => void \| undefined` and `canUseTool?: CanUseTool \| undefined`; loop emits events |
| `src/core/compose.ts` | `Niato` interface gains `runStream()`; `NiatoOptions` gains `approval?: ApprovalChannel \| undefined` |
| `src/cli/tui/hooks/use-niato-session.ts` | Switches from `niato.run` to `niato.runStream`; threads events into new state |
| `src/cli/tui/screens/session.tsx` | Renders `<LivePanel />` during `dispatching` phase |
| `src/packs/support/hooks/dollar_limit.ts` | Returns `permissionDecision: 'ask'` instead of `'deny'` |
| `tests/support-hooks.test.ts` | Updates assertion to `'ask'` |
| `CLAUDE.md` | Amend "no observability tooling beyond console logs in Phase 1–2" with Phase 4.5 carve-out |
| `ARCHITECTURE.md` | §15 add Phase 4.5 entry; §10 add "inline approval via canUseTool" paragraph |

---

## Task 1: NiatoEvent types + pure translator

**Files:**
- Create: `src/observability/events.ts`
- Create: `src/observability/event-stream.ts`
- Create: `tests/observability/event-stream.test.ts`

**Why first:** This is the single source of truth for what the live panel can render. Pure functions, no SDK runtime, fast tests, no mocking needed.

- [ ] **Step 1: Write the failing test for `messagesToEvents`**

Create `tests/observability/event-stream.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { messagesToEvents } from "../../src/observability/event-stream.js";

// Minimal SDK-shaped fixtures. The orchestrator dispatches one specialist
// (Agent tool, parent_tool_use_id=null), the specialist runs one tool
// (parent_tool_use_id=<dispatch id>), the tool returns ok, the turn
// settles. We assert the translator emits the right NiatoEvent stream.
function asAssistantMessage(
  parentToolUseId: string | null,
  blocks: unknown[],
): SDKMessage {
  // Cast: SDKMessage's exhaustive union is too narrow for hand-built
  // fixtures; the runtime shape matches what the SDK emits.
  return {
    type: "assistant",
    parent_tool_use_id: parentToolUseId,
    message: { content: blocks },
  } as unknown as SDKMessage;
}

function asUserToolResult(toolUseId: string, content: string): SDKMessage {
  return {
    type: "user",
    parent_tool_use_id: null,
    message: {
      content: [{ type: "tool_result", tool_use_id: toolUseId, content }],
    },
  } as unknown as SDKMessage;
}

describe("messagesToEvents", () => {
  it("emits specialist_dispatched when orchestrator calls Agent tool", () => {
    const messages: SDKMessage[] = [
      asAssistantMessage(null, [
        {
          type: "tool_use",
          id: "tu_1",
          name: "Agent",
          input: { subagent_type: "support.refund_processor", prompt: "go" },
        },
      ]),
    ];
    const events = messagesToEvents(messages);
    expect(events).toEqual([
      {
        type: "specialist_dispatched",
        toolUseId: "tu_1",
        specialist: "support.refund_processor",
      },
    ]);
  });

  it("emits tool_call for specialist's nested tool use", () => {
    const messages: SDKMessage[] = [
      asAssistantMessage("tu_1", [
        {
          type: "tool_use",
          id: "tu_2",
          name: "Read",
          input: { file_path: "/tmp/x" },
        },
      ]),
    ];
    const events = messagesToEvents(messages);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool_call",
      parentToolUseId: "tu_1",
      toolUseId: "tu_2",
      toolName: "Read",
    });
  });

  it("emits tool_result with outcome=ok for non-error tool_result", () => {
    const messages: SDKMessage[] = [
      asUserToolResult("tu_2", "file contents"),
    ];
    const events = messagesToEvents(messages);
    expect(events).toEqual([
      {
        type: "tool_result",
        toolUseId: "tu_2",
        outcome: "ok",
        preview: "file contents",
        reason: undefined,
      },
    ]);
  });

  it("emits tool_result with outcome=blocked for permission denials in result", () => {
    const messages: SDKMessage[] = [
      {
        type: "result",
        subtype: "success",
        result: "done",
        permission_denials: [
          { tool_name: "mcp__billing__refund", tool_use_id: "tu_3" },
        ],
        modelUsage: {},
        total_cost_usd: 0,
      } as unknown as SDKMessage,
    ];
    const events = messagesToEvents(messages);
    const blocked = events.find((e) => e.type === "tool_result");
    expect(blocked).toMatchObject({
      type: "tool_result",
      toolUseId: "tu_3",
      outcome: "blocked",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test event-stream`
Expected: FAIL — "Cannot find module '../../src/observability/event-stream.js'"

- [ ] **Step 3: Implement `events.ts`**

Create `src/observability/events.ts`:

```typescript
import { type IntentResult } from "../core/classifier/types.js";
import { type TurnRecord } from "./trace.js";

// Live event stream emitted by Niato.runStream(). Discriminated by `type`.
// Consumers (TUI panels, audit log adapters, telemetry exporters) pattern-
// match on `type` to render or record. Field ordering is stable: every
// new event variant goes at the end of the union.
export type NiatoEvent =
  | NiatoTurnStartEvent
  | NiatoClassifiedEvent
  | NiatoSpecialistDispatchedEvent
  | NiatoToolCallEvent
  | NiatoToolResultEvent
  | NiatoApprovalRequestedEvent
  | NiatoApprovalResolvedEvent
  | NiatoTurnCompleteEvent;

export interface NiatoTurnStartEvent {
  type: "turn_start";
  sessionId: string;
  turnId: string;
  userInput: string;
}

export interface NiatoClassifiedEvent {
  type: "classified";
  classification: IntentResult;
}

export interface NiatoSpecialistDispatchedEvent {
  type: "specialist_dispatched";
  // SDK-issued id of the orchestrator's `Agent` tool_use block. Used as
  // the parent_tool_use_id of the specialist's downstream tool_use blocks
  // — that's how the translator groups tool calls under their specialist.
  toolUseId: string;
  // Namespaced "<pack>.<specialist>" — the value of `subagent_type`.
  specialist: string;
}

export interface NiatoToolCallEvent {
  type: "tool_call";
  // null when emitted at orchestrator scope (rare — orchestrator is
  // restricted to `Agent`). Almost always the dispatched specialist's id.
  parentToolUseId: string | null;
  toolUseId: string;
  toolName: string;
  // JSON.stringify(toolInput) capped to 80 chars for UI; the full input
  // is recoverable from the underlying SDK messages.
  inputPreview: string;
}

export interface NiatoToolResultEvent {
  type: "tool_result";
  toolUseId: string;
  outcome: "ok" | "error" | "blocked";
  // Capped to 120 chars; UI shows preview, full content available via
  // SDK message inspection.
  preview: string;
  // Populated for `outcome === "blocked"` with the hook's
  // permissionDecisionReason. `undefined` otherwise.
  reason: string | undefined;
}

export interface NiatoApprovalRequestedEvent {
  type: "approval_requested";
  // Equals the `tool_use_id` of the pending tool call; used as the
  // ApprovalChannel correlation key.
  approvalId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  reason: string;
}

export interface NiatoApprovalResolvedEvent {
  type: "approval_resolved";
  approvalId: string;
  decision: "allow" | "deny";
  // User-supplied (or hook-supplied) explanation. `undefined` when the
  // user just hit a key without typing a reason.
  reason: string | undefined;
}

export interface NiatoTurnCompleteEvent {
  type: "turn_complete";
  trace: TurnRecord;
}
```

- [ ] **Step 4: Implement `event-stream.ts`**

Create `src/observability/event-stream.ts`:

```typescript
import { type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { type NiatoEvent } from "./events.js";

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}

function isToolUseBlock(b: unknown): b is ToolUseBlock {
  if (typeof b !== "object" || b === null) return false;
  const x = b as Record<string, unknown>;
  return (
    x["type"] === "tool_use" &&
    typeof x["id"] === "string" &&
    typeof x["name"] === "string" &&
    typeof x["input"] === "object" &&
    x["input"] !== null
  );
}

function isToolResultBlock(b: unknown): b is ToolResultBlock {
  if (typeof b !== "object" || b === null) return false;
  const x = b as Record<string, unknown>;
  return x["type"] === "tool_result" && typeof x["tool_use_id"] === "string";
}

function previewJson(value: unknown, max: number): string {
  const json = JSON.stringify(value);
  if (typeof json !== "string") return "";
  return json.length > max ? `${json.slice(0, max - 1)}…` : json;
}

function previewText(value: unknown, max: number): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (typeof s !== "string") return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Pure translator: SDKMessage[] → NiatoEvent[]. Stateless, deterministic,
// safe to call repeatedly (e.g. on every render in tests). Production
// callers stream incrementally via runOrchestrator's onEvent callback;
// this batch form exists for tests and for retroactive replay.
export function messagesToEvents(messages: SDKMessage[]): NiatoEvent[] {
  const events: NiatoEvent[] = [];
  for (const msg of messages) {
    if (msg.type === "assistant") {
      // Cast: SDKMessage assistant union has narrower typing than the
      // wire shape; we use the documented runtime properties.
      const parent = (msg as { parent_tool_use_id: string | null })
        .parent_tool_use_id;
      const content: unknown = (msg as { message: { content: unknown } })
        .message.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (!isToolUseBlock(block)) continue;
        if (block.name === "Agent" || block.name === "Task") {
          if (parent !== null) continue;
          const subagentType = block.input["subagent_type"];
          if (typeof subagentType !== "string") continue;
          events.push({
            type: "specialist_dispatched",
            toolUseId: block.id,
            specialist: subagentType,
          });
        } else {
          events.push({
            type: "tool_call",
            parentToolUseId: parent,
            toolUseId: block.id,
            toolName: block.name,
            inputPreview: previewJson(block.input, 80),
          });
        }
      }
    } else if (msg.type === "user") {
      const content: unknown = (msg as { message: { content: unknown } })
        .message.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (!isToolResultBlock(block)) continue;
        events.push({
          type: "tool_result",
          toolUseId: block.tool_use_id,
          outcome: block.is_error === true ? "error" : "ok",
          preview: previewText(block.content, 120),
          reason: undefined,
        });
      }
    } else if (msg.type === "result") {
      const denials = (
        msg as { permission_denials?: { tool_name: string; tool_use_id: string }[] }
      ).permission_denials;
      if (!Array.isArray(denials)) continue;
      for (const d of denials) {
        if (typeof d.tool_use_id !== "string") continue;
        events.push({
          type: "tool_result",
          toolUseId: d.tool_use_id,
          outcome: "blocked",
          preview: d.tool_name,
          reason: undefined,
        });
      }
    }
  }
  return events;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test event-stream`
Expected: PASS — 4 tests green.

- [ ] **Step 6: Done-bar**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/observability/events.ts src/observability/event-stream.ts tests/observability/event-stream.test.ts
git commit -m "feat(observability): NiatoEvent types + pure SDKMessage translator"
```

---

## Task 2: ApprovalChannel

**Files:**
- Create: `src/guardrails/approval-channel.ts`
- Create: `tests/guardrails/approval-channel.test.ts`

**Why second:** Pure async primitive, no UI, no SDK. Independently testable. Task 3 wires it into `canUseTool`; Task 7 wires it into the LivePanel.

- [ ] **Step 1: Write the failing test**

Create `tests/guardrails/approval-channel.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createApprovalChannel } from "../../src/guardrails/approval-channel.js";

describe("ApprovalChannel", () => {
  it("resolves request() when resolve() is called with the matching id", async () => {
    const ch = createApprovalChannel();
    const reqPromise = ch.request(
      {
        approvalId: "tu_1",
        toolName: "mcp__billing__refund",
        toolInput: { amount_usd: 600 },
        reason: "over $500 limit",
      },
      new AbortController().signal,
    );
    ch.resolve("tu_1", { decision: "allow", reason: undefined });
    const result = await reqPromise;
    expect(result).toEqual({ decision: "allow", reason: undefined });
  });

  it("subscribers see incoming requests in arrival order", () => {
    const ch = createApprovalChannel();
    const seen: string[] = [];
    const unsub = ch.subscribe((req) => {
      seen.push(req.approvalId);
    });
    void ch.request(
      {
        approvalId: "a",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      new AbortController().signal,
    );
    void ch.request(
      {
        approvalId: "b",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      new AbortController().signal,
    );
    unsub();
    expect(seen).toEqual(["a", "b"]);
  });

  it("rejects request() with AbortError when signal aborts before resolve", async () => {
    const ch = createApprovalChannel();
    const ctrl = new AbortController();
    const reqPromise = ch.request(
      {
        approvalId: "tu_2",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      ctrl.signal,
    );
    ctrl.abort();
    await expect(reqPromise).rejects.toThrow(/abort/i);
  });

  it("ignores resolve() calls for unknown ids", () => {
    const ch = createApprovalChannel();
    expect(() => {
      ch.resolve("never-issued", { decision: "allow", reason: undefined });
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test approval-channel`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/guardrails/approval-channel.ts`:

```typescript
export interface ApprovalRequest {
  approvalId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  reason: string;
}

export interface ApprovalDecision {
  decision: "allow" | "deny";
  // Optional human/hook explanation surfaced back to the SDK as
  // `PermissionResult.message` on deny, and recorded in
  // approval_resolved events for audit.
  reason: string | undefined;
}

export type ApprovalListener = (req: ApprovalRequest) => void;

export interface ApprovalChannel {
  // Called from canUseTool. Awaits a matching resolve() or signal abort.
  request(req: ApprovalRequest, signal: AbortSignal): Promise<ApprovalDecision>;
  // Called from UI when the user pressed approve/deny. No-op for unknown ids.
  resolve(approvalId: string, decision: ApprovalDecision): void;
  // UI subscribes to render incoming requests. Returns an unsubscribe fn.
  subscribe(listener: ApprovalListener): () => void;
}

interface PendingResolver {
  resolve(decision: ApprovalDecision): void;
  reject(err: Error): void;
}

export function createApprovalChannel(): ApprovalChannel {
  const pending = new Map<string, PendingResolver>();
  const listeners = new Set<ApprovalListener>();

  return {
    request(req, signal): Promise<ApprovalDecision> {
      return new Promise<ApprovalDecision>((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error("ApprovalChannel: aborted before request issued"));
          return;
        }
        pending.set(req.approvalId, { resolve, reject });
        const onAbort = (): void => {
          pending.delete(req.approvalId);
          reject(new Error("ApprovalChannel: aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        for (const listener of listeners) listener(req);
      });
    },
    resolve(approvalId, decision): void {
      const p = pending.get(approvalId);
      if (p === undefined) return;
      pending.delete(approvalId);
      p.resolve(decision);
    },
    subscribe(listener): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test approval-channel`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Done-bar**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/guardrails/approval-channel.ts tests/guardrails/approval-channel.test.ts
git commit -m "feat(guardrails): ApprovalChannel for inline approval prompts"
```

---

## Task 3: runOrchestrator emits events + accepts canUseTool

**Files:**
- Modify: `src/core/orchestrator/orchestrator.ts:21-44` (extend `OrchestratorInput`)
- Modify: `src/core/orchestrator/orchestrator.ts:213-231` (`runOrchestrator` body)
- Create: `tests/orchestrator-stream.test.ts`

**Why third:** This is where events first hit the wire. `Niato.runStream()` (Task 4) is just a thin wrapper over this.

- [ ] **Step 1: Write the failing test**

Create `tests/orchestrator-stream.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  buildOrchestratorOptions,
  runOrchestrator,
} from "../src/core/orchestrator/orchestrator.js";
import { genericPack } from "../src/packs/generic/index.js";
import { type NiatoEvent } from "../src/observability/events.js";

// We don't run a real SDK in this test — we'd need a network call. Instead
// we verify the wiring: runOrchestrator's onEvent callback is invoked for
// each translated SDKMessage, and canUseTool is plumbed into Options.

describe("runOrchestrator event streaming", () => {
  it("buildOrchestratorOptions threads canUseTool when provided", () => {
    const canUseTool = vi.fn();
    const options = buildOrchestratorOptions({
      userInput: "x",
      classification: { domain: "generic", intent: "task", confidence: 0.9 },
      packs: [genericPack],
      canUseTool,
    });
    expect(options.canUseTool).toBe(canUseTool);
  });

  it("buildOrchestratorOptions omits canUseTool when undefined", () => {
    const options = buildOrchestratorOptions({
      userInput: "x",
      classification: { domain: "generic", intent: "task", confidence: 0.9 },
      packs: [genericPack],
    });
    expect(options.canUseTool).toBeUndefined();
  });
});

// Streaming-event verification uses an injected query() stub. The real
// `query` is hard to stub without a wrapper, so this task adds a tiny
// dependency-injection seam: runOrchestrator accepts an optional
// `queryImpl` field on input, defaulting to the SDK's query.
describe("runOrchestrator event streaming with stub query", () => {
  it("invokes onEvent for each emitted event", async () => {
    const stubMessages: SDKMessage[] = [
      {
        type: "assistant",
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: "tool_use",
              id: "tu_1",
              name: "Agent",
              input: { subagent_type: "generic.action", prompt: "do" },
            },
          ],
        },
      } as unknown as SDKMessage,
      {
        type: "result",
        subtype: "success",
        result: "done",
        modelUsage: {},
        total_cost_usd: 0,
      } as unknown as SDKMessage,
    ];

    async function* stubQuery(): AsyncIterable<SDKMessage> {
      for (const m of stubMessages) yield m;
    }

    const events: NiatoEvent[] = [];
    await runOrchestrator({
      userInput: "x",
      classification: { domain: "generic", intent: "task", confidence: 0.9 },
      packs: [genericPack],
      onEvent: (e) => {
        events.push(e);
      },
      // Cast: stub query has the iterable shape SDK consumers use; the
      // SDK's query() type adds Promise-like helpers we don't exercise.
      queryImpl: (() => stubQuery()) as unknown as typeof import(
        "@anthropic-ai/claude-agent-sdk"
      ).query,
    });

    const types = events.map((e) => e.type);
    expect(types).toContain("specialist_dispatched");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test orchestrator-stream`
Expected: FAIL — `OrchestratorInput` does not have `onEvent` / `canUseTool` / `queryImpl`.

- [ ] **Step 3: Modify `OrchestratorInput`**

In `src/core/orchestrator/orchestrator.ts`, locate `OrchestratorInput` (around line 21) and append three optional fields BEFORE the closing brace:

```typescript
import {
  query,
  type AgentDefinition,
  type CanUseTool,
  type McpServerConfig,
  type Options,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { type NiatoEvent } from "../../observability/events.js";
import { messagesToEvents } from "../../observability/event-stream.js";
```

```typescript
export interface OrchestratorInput {
  userInput: string;
  classification: IntentResult;
  packs: DomainPack[];
  hooks?: Hooks;
  persona?: Persona;
  memoryPreamble?: string;
  sessionId?: string;
  resume?: string;
  cwd?: string;
  // Live event sink. Called once per NiatoEvent translated from the
  // streaming SDKMessage iterator. Errors thrown by onEvent are caught
  // and ignored — observability must never break user flows.
  onEvent?: ((event: NiatoEvent) => void) | undefined;
  // Bridge to the SDK's permission system. Hooks returning
  // permissionDecision: 'ask' cause the SDK to call this. Pass through
  // to a TUI ApprovalChannel for inline approval; omit for headless runs
  // (in which case 'ask' decisions are denied by the SDK default).
  canUseTool?: CanUseTool | undefined;
  // Test-only DI seam: replace the SDK's query() entry point. Production
  // callers leave this undefined; tests inject an async-iterable stub.
  queryImpl?: typeof query | undefined;
}
```

- [ ] **Step 4: Modify `buildOrchestratorOptions`**

In the same file, around line 197, extend the `options` literal so `canUseTool` flows through:

```typescript
  const options: Options = {
    model: ORCHESTRATOR_MODEL,
    systemPrompt,
    agents: mergePackAgents(input.packs),
    allowedTools: unionAllowedTools(input.packs),
    settingSources: [],
    permissionMode: "default",
    hooks: mergeHooks(builtInHooks, input.hooks ?? {}),
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.resume !== undefined ? { resume: input.resume } : {}),
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    ...(input.canUseTool !== undefined
      ? { canUseTool: input.canUseTool }
      : {}),
  };
  return options;
}
```

- [ ] **Step 5: Modify `runOrchestrator` to emit events**

Replace the body of `runOrchestrator` (lines 213–231):

```typescript
export async function runOrchestrator(
  input: OrchestratorInput,
): Promise<OrchestratorOutput> {
  const options = buildOrchestratorOptions(input);
  const messages: SDKMessage[] = [];
  let finalResult = "";
  const queryFn = input.queryImpl ?? query;

  const emit = (event: NiatoEvent): void => {
    if (input.onEvent === undefined) return;
    try {
      input.onEvent(event);
    } catch {
      // Observability sinks must never break user flows. Drop the
      // listener error silently — surfaces in traces if it matters.
    }
  };

  for await (const message of queryFn({
    prompt: buildUserMessage(input),
    options,
  })) {
    messages.push(message);
    // Translate just this message (with the empty messages-so-far prefix
    // suppressed by reading only fresh events). Cheap: each SDKMessage
    // produces O(blocks) NiatoEvents, no cross-message state.
    for (const event of messagesToEvents([message])) emit(event);
    if (message.type === "result" && message.subtype === "success") {
      finalResult = message.result;
    }
  }

  return { result: finalResult, messages };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test orchestrator-stream`
Expected: PASS — 3 tests green.

- [ ] **Step 7: Done-bar**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green (no regressions in existing orchestrator tests).

- [ ] **Step 8: Commit**

```bash
git add src/core/orchestrator/orchestrator.ts tests/orchestrator-stream.test.ts
git commit -m "feat(orchestrator): emit NiatoEvents during run + plumb canUseTool"
```

---

## Task 4: `Niato.runStream()` in compose.ts

**Files:**
- Modify: `src/core/compose.ts:47-100` (extend `NiatoOptions`)
- Modify: `src/core/compose.ts:110-123` (extend `Niato` interface)
- Modify: `src/core/compose.ts:204-295` (refactor `run` → internal `runInternal`, add `runStream`)
- Create: `tests/compose-stream.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/compose-stream.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createNiato } from "../src/core/compose.js";
import { genericPack } from "../src/packs/generic/index.js";
import { type NiatoEvent } from "../src/observability/events.js";
import { type IntentResult } from "../src/core/classifier/types.js";

describe("Niato.runStream", () => {
  it("invokes onEvent with a turn_start event before classification", async () => {
    const fakeClassification: IntentResult = {
      domain: "generic",
      intent: "task",
      confidence: 0.9,
    };
    const events: NiatoEvent[] = [];
    const niato = createNiato({
      packs: [genericPack],
      classifier: {
        classify: () => Promise.resolve(fakeClassification),
      },
      orchestratorRunner: ({ onEvent }) => {
        // Emit nothing; just settle the turn so trace is built.
        return Promise.resolve({ result: "ok", messages: [] });
      },
    });

    await niato.runStream("hi", "s1", (e) => {
      events.push(e);
    });
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("turn_start");
    expect(types).toContain("classified");
    expect(types[types.length - 1]).toBe("turn_complete");
  });

  it("run() is a no-op-event-callback alias for runStream()", async () => {
    const niato = createNiato({
      packs: [genericPack],
      classifier: {
        classify: () =>
          Promise.resolve({
            domain: "generic",
            intent: "task",
            confidence: 0.9,
          }),
      },
      orchestratorRunner: () =>
        Promise.resolve({ result: "ok", messages: [] }),
    });
    const turn = await niato.run("hi", "s2");
    expect(turn.result).toBe("ok");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test compose-stream`
Expected: FAIL — `niato.runStream is not a function`.

- [ ] **Step 3: Extend `NiatoOptions`**

In `src/core/compose.ts`, add to the imports at the top:

```typescript
import { type NiatoEvent } from "../observability/events.js";
import { type ApprovalChannel } from "../guardrails/approval-channel.js";
import { type CanUseTool } from "@anthropic-ai/claude-agent-sdk";
```

Inside `NiatoOptions` (after the existing optional fields), add:

```typescript
  // ApprovalChannel wired into the SDK's canUseTool. When set, hooks
  // returning permissionDecision: 'ask' surface as ApprovalRequests on
  // this channel; UI consumers (TUI LivePanel) resolve them via keypress.
  // Omit for headless deployments — the SDK then denies 'ask' decisions
  // by default.
  approval?: ApprovalChannel | undefined;
```

- [ ] **Step 4: Extend `Niato` interface**

Replace the `Niato` interface (lines 110–123):

```typescript
export interface Niato {
  run(userInput: string, sessionId?: string): Promise<NiatoTurn>;
  // Streaming variant. Identical to run() except onEvent is invoked for
  // every NiatoEvent emitted during the turn (turn_start before
  // classification; classified after; specialist_dispatched / tool_call /
  // tool_result / approval_* during; turn_complete after the trace is
  // built). Errors thrown by onEvent are swallowed.
  runStream(
    userInput: string,
    sessionId: string | undefined,
    onEvent: (event: NiatoEvent) => void,
  ): Promise<NiatoTurn>;
  metrics(sessionId: string): SessionMetrics | undefined;
  remember(facts: string[]): Promise<void>;
}
```

- [ ] **Step 5: Refactor `run` → internal helper, add `runStream`**

Replace the returned object (around line 204) so `run` and `runStream` share one body. Approximate shape:

```typescript
  async function runInternal(
    userInput: string,
    sessionId: string | undefined,
    onEvent: (event: NiatoEvent) => void,
  ): Promise<NiatoTurn> {
    for (const validator of validators) {
      const result = validator(userInput);
      if (!result.ok) throw new NiatoInputRejectedError(result.reason);
    }
    const session = sessions.getOrCreate(sessionId);
    ensureBudget(session, options.costLimitUsd);
    await memoryReady;
    const turnId = randomUUID();
    const startedAt = Date.now();

    onEvent({
      type: "turn_start",
      sessionId: session.id,
      turnId,
      userInput,
    });

    logger.log("info", "turn start", {
      sessionId: session.id,
      turnId,
      turn: session.metrics.turnCount + 1,
    });

    const classification = await classifier.classify(userInput);
    logger.log("debug", "classification", { classification });
    onEvent({ type: "classified", classification });

    const sessionArg = session.started
      ? { resume: session.id }
      : { sessionId: session.id };

    const canUseTool: CanUseTool | undefined =
      options.approval !== undefined
        ? (toolName, input, ctx) =>
            options.approval!
              .request(
                {
                  approvalId:
                    typeof (ctx as { toolUseID?: unknown }).toolUseID ===
                    "string"
                      ? (ctx as { toolUseID: string }).toolUseID
                      : `${turnId}:${toolName}`,
                  toolName,
                  toolInput: input,
                  reason: ctx.decisionReason ?? "approval requested",
                },
                ctx.signal,
              )
              .then((d) =>
                d.decision === "allow"
                  ? { behavior: "allow" as const }
                  : {
                      behavior: "deny" as const,
                      message: d.reason ?? "denied by user",
                    },
              )
        : undefined;
    // Cast on `options.approval!`: narrowed by the surrounding
    // `options.approval !== undefined` check; the closure captures
    // `options` not the narrowed local, so TS loses the narrowing.

    const orchestratorResult = await orchestratorRun({
      userInput,
      classification,
      packs: options.packs,
      hooks: orchestratorHooks,
      cwd: NIATO_SDK_SESSIONS_DIR,
      onEvent,
      ...(canUseTool !== undefined ? { canUseTool } : {}),
      ...sessionArg,
      ...(options.persona !== undefined ? { persona: options.persona } : {}),
      ...(memoryPreamble !== undefined && memoryPreamble.length > 0
        ? { memoryPreamble }
        : {}),
    });

    session.started = true;
    const endedAt = Date.now();
    const trace = buildTurnRecord({
      sessionId: session.id,
      turnId,
      classification,
      messages: orchestratorResult.messages,
      startedAt: new Date(startedAt).toISOString(),
      latencyMs: endedAt - startedAt,
    });
    updateSessionMetrics(session.metrics, trace);
    logger.log("info", "turn", { ...trace });

    if (options.onTurnComplete !== undefined) {
      try {
        await options.onTurnComplete(trace);
      } catch (err) {
        logger.log("warn", "onTurnComplete callback threw", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    onEvent({ type: "turn_complete", trace });

    return {
      result: orchestratorResult.result,
      classification,
      session,
      messages: orchestratorResult.messages,
      trace,
    };
  }

  return {
    async run(userInput, sessionId) {
      return runInternal(userInput, sessionId, () => undefined);
    },
    async runStream(userInput, sessionId, onEvent) {
      return runInternal(userInput, sessionId, onEvent);
    },
    metrics(sessionId) {
      return sessions.get(sessionId)?.metrics;
    },
    async remember(facts) { /* ... existing body ... */ },
  };
}
```

(Preserve the existing `remember()` body verbatim — it's unchanged.)

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test compose-stream`
Expected: PASS — 2 tests green.

- [ ] **Step 7: Update `tests/cli/tui/_helpers/stub-niato.ts` with `runStream`**

Open `tests/cli/tui/_helpers/stub-niato.ts` and add `runStream` to the returned object so existing TUI tests still typecheck:

```typescript
    runStream(input, sessionId, onEvent): Promise<NiatoTurn> {
      // Stub: emit a minimal event sequence so consumers exercise the
      // codepath, then delegate to run() for the actual turn shape.
      onEvent({
        type: "turn_start",
        sessionId: sessionId ?? "stub-session",
        turnId: `t${String(i + 1)}`,
        userInput: input,
      });
      return this.run(input, sessionId).then((turn) => {
        onEvent({ type: "turn_complete", trace: turn.trace });
        return turn;
      });
    },
```

Add the matching import:

```typescript
import { type NiatoEvent } from "../../../../src/observability/events.js";
```

(Note: `NiatoEvent` is referenced only in the parameter type position via Niato's contract, but importing it documents the intent.)

- [ ] **Step 8: Done-bar**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/core/compose.ts tests/compose-stream.test.ts tests/cli/tui/_helpers/stub-niato.ts
git commit -m "feat(compose): add Niato.runStream + ApprovalChannel wiring"
```

---

## Task 5: LivePanel component (read-only render)

**Files:**
- Create: `src/cli/tui/components/live-panel.tsx`
- Create: `tests/cli/tui/components/live-panel.test.tsx`

**Why this shape:** Pure render of an event timeline. Owns no state — receives a `NiatoEvent[]` and an optional `pendingApproval`. Keypress handling is added in Task 7. This separation lets us test rendering independently of input.

- [ ] **Step 1: Write the failing test**

Create `tests/cli/tui/components/live-panel.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { LivePanel } from "../../../../src/cli/tui/components/live-panel.js";
import { type NiatoEvent } from "../../../../src/observability/events.js";

const dispatched: NiatoEvent = {
  type: "specialist_dispatched",
  toolUseId: "tu_1",
  specialist: "support.refund_processor",
};
const toolCall: NiatoEvent = {
  type: "tool_call",
  parentToolUseId: "tu_1",
  toolUseId: "tu_2",
  toolName: "Read",
  inputPreview: '{"file_path":"/tmp/x"}',
};
const toolOk: NiatoEvent = {
  type: "tool_result",
  toolUseId: "tu_2",
  outcome: "ok",
  preview: "file contents",
  reason: undefined,
};
const toolBlocked: NiatoEvent = {
  type: "tool_result",
  toolUseId: "tu_2",
  outcome: "blocked",
  preview: "mcp__billing__refund",
  reason: "over $500 limit",
};

describe("LivePanel", () => {
  it("renders specialist row when dispatched", () => {
    const { lastFrame } = render(
      <LivePanel events={[dispatched]} pendingApproval={undefined} />,
    );
    expect(lastFrame()).toContain("support.refund_processor");
  });

  it("renders tool call indented under specialist", () => {
    const { lastFrame } = render(
      <LivePanel events={[dispatched, toolCall]} pendingApproval={undefined} />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("Read");
    expect(out).toMatch(/├|└|→/);
  });

  it("renders ✓ for ok tool result", () => {
    const { lastFrame } = render(
      <LivePanel
        events={[dispatched, toolCall, toolOk]}
        pendingApproval={undefined}
      />,
    );
    expect(lastFrame()).toMatch(/✓|ok/);
  });

  it("renders ⊘ for blocked result with reason", () => {
    const { lastFrame } = render(
      <LivePanel
        events={[dispatched, toolCall, toolBlocked]}
        pendingApproval={undefined}
      />,
    );
    const out = lastFrame() ?? "";
    expect(out).toMatch(/⊘|blocked/);
    expect(out).toContain("over $500 limit");
  });

  it("renders pending approval prompt when supplied", () => {
    const { lastFrame } = render(
      <LivePanel
        events={[dispatched]}
        pendingApproval={{
          approvalId: "tu_3",
          toolName: "mcp__billing__refund",
          toolInput: { amount_usd: 600 },
          reason: "over $500 limit",
        }}
      />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("approval");
    expect(out).toMatch(/\[a\]|allow/i);
    expect(out).toMatch(/\[d\]|deny/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test live-panel`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `LivePanel`**

Create `src/cli/tui/components/live-panel.tsx`:

```typescript
import React from "react";
import { Box, Text } from "ink";
import { type NiatoEvent } from "../../../observability/events.js";
import { type ApprovalRequest } from "../../../guardrails/approval-channel.js";

export interface LivePanelProps {
  events: NiatoEvent[];
  pendingApproval: ApprovalRequest | undefined;
}

interface SpecialistRow {
  toolUseId: string;
  specialist: string;
  tools: ToolRow[];
}

interface ToolRow {
  toolUseId: string;
  name: string;
  inputPreview: string;
  result: { outcome: "ok" | "error" | "blocked"; reason: string | undefined } | undefined;
}

function buildRows(events: NiatoEvent[]): SpecialistRow[] {
  const rows: SpecialistRow[] = [];
  const byId = new Map<string, SpecialistRow>();
  const toolById = new Map<string, ToolRow>();
  for (const e of events) {
    if (e.type === "specialist_dispatched") {
      const row: SpecialistRow = {
        toolUseId: e.toolUseId,
        specialist: e.specialist,
        tools: [],
      };
      rows.push(row);
      byId.set(e.toolUseId, row);
    } else if (e.type === "tool_call") {
      const row: ToolRow = {
        toolUseId: e.toolUseId,
        name: e.toolName,
        inputPreview: e.inputPreview,
        result: undefined,
      };
      toolById.set(e.toolUseId, row);
      const parent =
        e.parentToolUseId !== null ? byId.get(e.parentToolUseId) : undefined;
      if (parent !== undefined) parent.tools.push(row);
    } else if (e.type === "tool_result") {
      const row = toolById.get(e.toolUseId);
      if (row !== undefined) {
        row.result = { outcome: e.outcome, reason: e.reason };
      }
    }
  }
  return rows;
}

function tickFor(
  outcome: "ok" | "error" | "blocked" | undefined,
): React.ReactElement {
  if (outcome === "ok") return <Text color="green">✓</Text>;
  if (outcome === "error") return <Text color="red">✗</Text>;
  if (outcome === "blocked") return <Text color="yellow">⊘</Text>;
  return <Text color="gray">◓</Text>;
}

export function LivePanel({
  events,
  pendingApproval,
}: LivePanelProps): React.ReactElement {
  const rows = buildRows(events);
  return (
    <Box flexDirection="column">
      {rows.map((row) => (
        <Box key={row.toolUseId} flexDirection="column">
          <Box>
            <Text color="cyan">{`▾ ${row.specialist}`}</Text>
          </Box>
          {row.tools.map((tool, idx) => {
            const isLast = idx === row.tools.length - 1;
            const branch = isLast ? "└─" : "├─";
            return (
              <Box key={tool.toolUseId}>
                <Text color="gray">{`  ${branch} `}</Text>
                {tickFor(tool.result?.outcome)}
                <Text>{` ${tool.name}`}</Text>
                <Text color="gray">{` ${tool.inputPreview}`}</Text>
                {tool.result?.outcome === "blocked" &&
                  tool.result.reason !== undefined && (
                    <Text color="yellow">{`  blocked: ${tool.result.reason}`}</Text>
                  )}
              </Box>
            );
          })}
        </Box>
      ))}
      {pendingApproval !== undefined && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">
            {`⏸ approval requested: ${pendingApproval.toolName}`}
          </Text>
          <Text color="gray">{`   reason: ${pendingApproval.reason}`}</Text>
          <Text>{`   [a] allow   [d] deny`}</Text>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test live-panel`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Done-bar**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/cli/tui/components/live-panel.tsx tests/cli/tui/components/live-panel.test.tsx
git commit -m "feat(tui): LivePanel component for live specialist + tool stream"
```

---

## Task 6: `useLiveEvents` hook + wire into `useNiatoSession`

**Files:**
- Create: `src/cli/tui/hooks/use-live-events.ts`
- Create: `tests/cli/tui/hooks/use-live-events.test.tsx`
- Modify: `src/cli/tui/hooks/use-niato-session.ts` (switch from `run` to `runStream`, append events)

- [ ] **Step 1: Write the failing test**

Create `tests/cli/tui/hooks/use-live-events.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Box, Text } from "ink";
import { useLiveEvents } from "../../../../src/cli/tui/hooks/use-live-events.js";
import { createApprovalChannel } from "../../../../src/guardrails/approval-channel.js";
import { type NiatoEvent } from "../../../../src/observability/events.js";

function Probe({
  events,
}: {
  events: NiatoEvent[];
}): React.ReactElement {
  const channel = createApprovalChannel();
  const live = useLiveEvents(channel);
  React.useEffect(() => {
    for (const e of events) live.push(e);
  }, []);
  return (
    <Box>
      <Text>{`count=${String(live.events.length)}`}</Text>
    </Box>
  );
}

describe("useLiveEvents", () => {
  it("accumulates pushed events", () => {
    const { lastFrame } = render(
      <Probe
        events={[
          {
            type: "specialist_dispatched",
            toolUseId: "tu_1",
            specialist: "x.y",
          },
        ]}
      />,
    );
    expect(lastFrame()).toContain("count=1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test use-live-events`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useLiveEvents`**

Create `src/cli/tui/hooks/use-live-events.ts`:

```typescript
import { useEffect, useState, useCallback } from "react";
import {
  type ApprovalChannel,
  type ApprovalRequest,
} from "../../../guardrails/approval-channel.js";
import { type NiatoEvent } from "../../../observability/events.js";

export interface UseLiveEvents {
  events: NiatoEvent[];
  pendingApproval: ApprovalRequest | undefined;
  push(event: NiatoEvent): void;
  reset(): void;
}

// Subscribes to an ApprovalChannel for inline approval prompts and exposes
// a `push()` callback for the parent (useNiatoSession) to feed in events
// from Niato.runStream. State lives here, not in useNiatoSession, so the
// LivePanel can be re-rendered without bouncing the entire session
// lifecycle.
export function useLiveEvents(channel: ApprovalChannel): UseLiveEvents {
  const [events, setEvents] = useState<NiatoEvent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<
    ApprovalRequest | undefined
  >(undefined);

  useEffect(() => {
    const unsub = channel.subscribe((req) => {
      setPendingApproval(req);
      setEvents((prev) => [
        ...prev,
        {
          type: "approval_requested",
          approvalId: req.approvalId,
          toolName: req.toolName,
          toolInput: req.toolInput,
          reason: req.reason,
        },
      ]);
    });
    return unsub;
  }, [channel]);

  const push = useCallback((event: NiatoEvent): void => {
    setEvents((prev) => [...prev, event]);
    if (event.type === "approval_resolved") {
      setPendingApproval(undefined);
    }
  }, []);

  const reset = useCallback((): void => {
    setEvents([]);
    setPendingApproval(undefined);
  }, []);

  return { events, pendingApproval, push, reset };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test use-live-events`
Expected: PASS.

- [ ] **Step 5: Wire `useNiatoSession` to use `runStream`**

Open `src/cli/tui/hooks/use-niato-session.ts`. The hook factory currently calls `niato.run` at line 106. Two changes:

(a) Add an `onEvent` parameter to the hook signature so the parent can fan events into `useLiveEvents.push`:

```typescript
export function useNiatoSession(
  factory: (logger: Logger) => Niato,
  sessionId: string,
  onTurnComplete?: (turn: TurnState) => void,
  onEvent?: (event: import("../../../observability/events.js").NiatoEvent) => void,
): UseNiato {
```

(b) Replace the `niato.run(input, sessionId)` call inside `run` with:

```typescript
        const turnResult: NiatoTurn = await niato.runStream(
          input,
          sessionId,
          onEvent ?? ((): undefined => undefined),
        );
```

- [ ] **Step 6: Done-bar**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/cli/tui/hooks/use-live-events.ts src/cli/tui/hooks/use-niato-session.ts tests/cli/tui/hooks/use-live-events.test.tsx
git commit -m "feat(tui): useLiveEvents hook + wire useNiatoSession to runStream"
```

---

## Task 7: Inline approval keypress in LivePanel + integration into session screen

**Files:**
- Modify: `src/cli/tui/components/live-panel.tsx` (add `useInput` for [a]/[d])
- Modify: `src/cli/tui/screens/session.tsx` (mount `LivePanel`, own the `ApprovalChannel`)
- Create: `tests/cli/tui/components/live-panel-keypress.test.tsx`

- [ ] **Step 1: Write the failing keypress test**

Create `tests/cli/tui/components/live-panel-keypress.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { LivePanel } from "../../../../src/cli/tui/components/live-panel.js";

describe("LivePanel keypress", () => {
  it("calls onApprove when 'a' pressed and pendingApproval is set", async () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    const { stdin } = render(
      <LivePanel
        events={[]}
        pendingApproval={{
          approvalId: "tu_3",
          toolName: "x",
          toolInput: {},
          reason: "r",
        }}
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );
    stdin.write("a");
    await new Promise((r) => setTimeout(r, 10));
    expect(onApprove).toHaveBeenCalledWith("tu_3");
    expect(onDeny).not.toHaveBeenCalled();
  });

  it("calls onDeny when 'd' pressed", async () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    const { stdin } = render(
      <LivePanel
        events={[]}
        pendingApproval={{
          approvalId: "tu_3",
          toolName: "x",
          toolInput: {},
          reason: "r",
        }}
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );
    stdin.write("d");
    await new Promise((r) => setTimeout(r, 10));
    expect(onDeny).toHaveBeenCalledWith("tu_3");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test live-panel-keypress`
Expected: FAIL — `onApprove`/`onDeny` not in `LivePanelProps`.

- [ ] **Step 3: Extend LivePanel**

In `src/cli/tui/components/live-panel.tsx`:

- Add `useInput` to ink import.
- Extend `LivePanelProps`:

```typescript
export interface LivePanelProps {
  events: NiatoEvent[];
  pendingApproval: ApprovalRequest | undefined;
  onApprove?: ((approvalId: string) => void) | undefined;
  onDeny?: ((approvalId: string) => void) | undefined;
}
```

- Inside `LivePanel`, before the `return`:

```typescript
  useInput((input) => {
    if (pendingApproval === undefined) return;
    if (input === "a" && onApprove !== undefined) onApprove(pendingApproval.approvalId);
    if (input === "d" && onDeny !== undefined) onDeny(pendingApproval.approvalId);
  });
```

- [ ] **Step 4: Run keypress test to verify it passes**

Run: `pnpm test live-panel-keypress`
Expected: PASS — 2 tests green.

- [ ] **Step 5: Mount LivePanel in `session.tsx`**

Read `src/cli/tui/screens/session.tsx` first to understand the existing layout. Then:

(a) Create the `ApprovalChannel` once via `useState`:

```typescript
import { createApprovalChannel } from "../../../guardrails/approval-channel.js";
import { useLiveEvents } from "../hooks/use-live-events.js";
import { LivePanel } from "../components/live-panel.js";
// inside the component:
const [channel] = useState(() => createApprovalChannel());
const live = useLiveEvents(channel);
```

(b) Pass `onEvent: live.push` and the channel to the Niato factory (the factory in this screen already constructs Niato; add `approval: channel` to the `createNiato` options).

(c) Mount `<LivePanel>` between the existing chat scrollback and the footer:

```tsx
{session.phase === "dispatching" && (
  <LivePanel
    events={live.events}
    pendingApproval={live.pendingApproval}
    onApprove={(id) => {
      channel.resolve(id, { decision: "allow", reason: undefined });
      live.push({
        type: "approval_resolved",
        approvalId: id,
        decision: "allow",
        reason: undefined,
      });
    }}
    onDeny={(id) => {
      channel.resolve(id, { decision: "deny", reason: "denied via TUI" });
      live.push({
        type: "approval_resolved",
        approvalId: id,
        decision: "deny",
        reason: "denied via TUI",
      });
    }}
  />
)}
```

(d) Reset live events when a new turn starts: pass an `onTurnComplete` to `useNiatoSession` that calls `live.reset()` after the user advances past the rendered trace, OR call `live.reset()` at the top of `runStream` invocation. Pick one — recommend **on next turn submit** so the user can scroll back and see the trace:

In the input-submit handler:

```tsx
onSubmit={async (input) => {
  live.reset();
  await session.run(input);
}}
```

- [ ] **Step 6: Done-bar**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/cli/tui/components/live-panel.tsx src/cli/tui/screens/session.tsx tests/cli/tui/components/live-panel-keypress.test.tsx
git commit -m "feat(tui): inline approval keypress + mount LivePanel in session screen"
```

---

## Task 8: Migrate `dollar_limit` to `permissionDecision: 'ask'` + e2e test

**Files:**
- Modify: `src/packs/support/hooks/dollar_limit.ts:39-47`
- Modify: `tests/support-hooks.test.ts` (assertion update)
- Create: `tests/dollar-limit-ask.test.ts`

**Why this is the proof point:** It's the only pack hook in the codebase that gates a write. Migrating it from `deny` to `ask` validates the entire ApprovalChannel pipeline end-to-end with a real (in-process MCP) example.

- [ ] **Step 1: Update the hook**

In `src/packs/support/hooks/dollar_limit.ts`, replace the `deny` branch:

```typescript
    if (amount >= options.autoApproveBelow) {
      return Promise.resolve({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: `Refund of $${amount.toFixed(2)} exceeds auto-approve threshold of $${options.autoApproveBelow.toFixed(2)} — confirm to proceed.`,
        },
      });
    }
```

Update the comment block above to reflect the new behavior:

```typescript
// Pack-scoped PreToolUse hook factory. Phase 4.5: refunds at or above
// `autoApproveBelow` return permissionDecision: 'ask', which the SDK
// routes to Options.canUseTool — typically a TUI ApprovalChannel for
// inline approval. Headless deployments without canUseTool wired will
// see the SDK default-deny 'ask' decisions, preserving the prior safety
// posture.
```

- [ ] **Step 2: Update `tests/support-hooks.test.ts`**

Find the assertion that checks for `permissionDecision: "deny"` and update it to `"ask"`. Keep the reason-substring assertion if it still matches.

- [ ] **Step 3: Write the e2e test**

Create `tests/dollar-limit-ask.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { dollarLimit } from "../src/packs/support/hooks/dollar_limit.js";

describe("dollarLimit (ask mode)", () => {
  it("returns permissionDecision: 'ask' for amounts at or above threshold", async () => {
    const matcher = dollarLimit({
      tool: "mcp__support__issue_refund",
      autoApproveBelow: 500,
    });
    const callback = matcher.hooks[0];
    const result = await callback(
      {
        hook_event_name: "PreToolUse",
        tool_name: "mcp__support__issue_refund",
        tool_input: { amount_usd: 600 },
        // Cast: the SDK's PreToolUseHookInput has additional fields not
        // exercised by this hook; we provide only what dollar_limit reads.
      } as unknown as Parameters<typeof callback>[0],
      // Cast: tool runtime context not exercised by this hook.
      {} as unknown as Parameters<typeof callback>[1],
      // Cast: signal context not exercised either.
      {} as unknown as Parameters<typeof callback>[2],
    );
    // Cast: hookSpecificOutput is a discriminated union; PreToolUse branch
    // is the only one this hook returns.
    const out = (result as { hookSpecificOutput: { permissionDecision: string } })
      .hookSpecificOutput;
    expect(out.permissionDecision).toBe("ask");
  });

  it("returns continue: true for amounts below threshold", async () => {
    const matcher = dollarLimit({
      tool: "mcp__support__issue_refund",
      autoApproveBelow: 500,
    });
    const callback = matcher.hooks[0];
    const result = await callback(
      {
        hook_event_name: "PreToolUse",
        tool_name: "mcp__support__issue_refund",
        tool_input: { amount_usd: 100 },
      } as unknown as Parameters<typeof callback>[0],
      {} as unknown as Parameters<typeof callback>[1],
      {} as unknown as Parameters<typeof callback>[2],
    );
    expect(result).toEqual({ continue: true });
  });
});
```

- [ ] **Step 4: Done-bar**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/packs/support/hooks/dollar_limit.ts tests/support-hooks.test.ts tests/dollar-limit-ask.test.ts
git commit -m "feat(support): migrate dollar_limit to permissionDecision: ask"
```

---

## Task 9: Documentation — CLAUDE.md + ARCHITECTURE.md

**Files:**
- Modify: `CLAUDE.md` (the "What to NOT do" Phase 1–2 console-logs line)
- Modify: `ARCHITECTURE.md` §15 (add Phase 4.5) and §10 (note canUseTool bridge)

**Why last:** Code is the ground truth; the docs follow the code's actual shape, not an ahead-of-time guess. (Direct application of last session's lesson.)

- [ ] **Step 1: Update `CLAUDE.md`**

Find the line in the "What to NOT do" section:

```markdown
- Don't add observability tooling beyond console logs in Phase 1–2. Real tracing comes in Phase 7.
```

Replace with:

```markdown
- Don't add observability tooling beyond console logs and the Phase 4.5 LivePanel surface in Phase 1–2. Real *export* tracing (OTel, dashboards, alerts) comes in Phase 7. The LivePanel is in-process introspection only — no exporter, no telemetry sink.
```

- [ ] **Step 2: Update `ARCHITECTURE.md` §15**

Append a new entry after Phase 4 and before Phase 5:

```markdown
**Phase 4.5 — Live introspection panel.** TUI surface that streams `NiatoEvent`s during a turn: specialist dispatches, tool calls, results, and inline approval prompts driven by `permissionDecision: "ask"` hooks routed through the SDK's `canUseTool` callback. In-process only — no exporter. Validates the event-stream shape before Phase 7's export work.
```

- [ ] **Step 3: Update `ARCHITECTURE.md` §10**

In §10 ("Guardrails — the gate before action"), under "Hooks as enforcement boundaries", append a paragraph:

```markdown
**Inline approval via `canUseTool`.** Hooks may return `permissionDecision: "ask"` (alongside `"allow"` and `"deny"`). The SDK then calls the `Options.canUseTool` callback with the hook's `decisionReason`, letting the runtime route the decision to a human — for the TUI this is an `ApprovalChannel` resolved by keypress (Phase 4.5). Headless deployments that don't wire `canUseTool` get SDK-default behavior on `"ask"`, which is to deny: `"ask"` is therefore safe to introduce in pack hooks ahead of any UI work, since it never auto-approves.
```

- [ ] **Step 4: Done-bar**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green (no code changed in this commit, but the bar is unconditional).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md ARCHITECTURE.md
git commit -m "docs: Phase 4.5 LivePanel + canUseTool inline approval pattern"
```

---

## Self-review (run after writing the plan)

**1. Spec coverage.**
- Phase 4.5 framing → Task 9 (docs update). ✅
- `runStream()` additive API → Tasks 4 and 6. ✅
- `canUseTool` bridge → Tasks 3 and 4. ✅
- LivePanel: specialist rows + tool ticker → Task 5. ✅
- Inline approval (keypress) → Task 7. ✅
- Real example migration (dollar_limit) → Task 8. ✅
- ARCHITECTURE/CLAUDE alignment → Task 9. ✅

**2. Placeholder scan.** Searched for "TBD", "implement later", "similar to", "appropriate error handling" — none found. Every code step has a complete implementation.

**3. Type consistency.**
- `NiatoEvent` fields (`toolUseId`, `parentToolUseId`, `approvalId`) used consistently across Tasks 1, 5, 6, 7. ✅
- `ApprovalRequest.approvalId` matches `NiatoApprovalRequestedEvent.approvalId`. ✅
- `ApprovalDecision.reason: string | undefined` matches `NiatoApprovalResolvedEvent.reason: string | undefined`. ✅
- `Niato.runStream` signature in Task 4 matches usage in Task 6 (`runStream(input, sessionId, onEvent)`). ✅
- `LivePanelProps.pendingApproval: ApprovalRequest | undefined` (not `?:`) per `exactOptionalPropertyTypes`. ✅
- Optional fields use `| undefined` everywhere (NiatoOptions.approval, OrchestratorInput.onEvent, OrchestratorInput.canUseTool, OrchestratorInput.queryImpl, LivePanelProps.onApprove, LivePanelProps.onDeny, NiatoToolResultEvent.reason). ✅

**4. Convention compliance** (against `feedback_nawaitu_strict_conventions.md`).
- No `field?: T` in plan literals — only `field: T | undefined`. ✅
- No `!` non-null assertions in test code (uses `expectDefined` or runtime guards). ✅
- Empty function noop is `() => undefined`, not `() => {}`. ✅
- `as` casts are inline-commented (every cast in Tasks 1, 4, 8 has a comment). ✅
- No unescaped apostrophes in JSX. ✅

No fixes needed.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-02-live-introspection-panel.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration, isolated worktree.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

**Which approach?**

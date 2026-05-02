import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type CanUseTool,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { type DomainPack } from "../packs/DomainPack.js";
import { type NiatoEvent } from "../observability/events.js";
import {
  type ApprovalChannel,
  type ApprovalDecision,
} from "../guardrails/approval-channel.js";
import { type Classifier, type IntentResult } from "./classifier/types.js";
import { createSonnetClassifier } from "./classifier/sonnet.js";
import { runOrchestrator } from "./orchestrator/orchestrator.js";
import { type Hooks, mergeHooks } from "../guardrails/hooks.js";
import {
  type InputValidator,
  maxLengthValidator,
} from "../guardrails/validators.js";
import {
  NiatoInputRejectedError,
  NiatoBudgetExceededError,
} from "../guardrails/errors.js";
import {
  InMemorySessionStore,
  type SessionContext,
} from "../memory/session.js";
import { createConsoleLogger, type Logger } from "../observability/log.js";
import { buildTurnRecord, type TurnRecord } from "../observability/trace.js";
import {
  updateSessionMetrics,
  type SessionMetrics,
} from "../observability/metrics.js";
import { type Persona } from "./persona.js";
import { loadConfig, resolveAuthMode, type Config } from "./config.js";
import {
  type MemoryStore,
  FileMemoryStore,
  applyFactCap,
  buildMemoryPreamble,
  loadOrInitMemory,
  type LongTermMemoryRecord,
} from "../memory/long-term.js";

// Where the SDK persists conversation transcripts. Setting cwd here
// (rather than letting the SDK default to process.cwd()) means session
// memory is stable regardless of where the user launched niato from —
// `niato` from ~/Documents and `niato` from ~/Projects/foo see the
// same session storage.
const NIATO_SDK_SESSIONS_DIR = join(homedir(), ".niato", "sdk-sessions");

export interface NiatoOptions {
  packs: DomainPack[];
  classifier?: Classifier;
  // Hooks applied to every orchestrator session. Each pack may also declare
  // pack-scoped hooks; the orchestrator merges built-in invariants → global
  // hooks → pack hooks (in that order) and passes the result to the SDK.
  globalHooks?: Hooks;
  // Synchronous validators run on the raw user input before classification.
  // First failure aborts the turn with a NiatoInputRejectedError. Default:
  // [maxLengthValidator(32_000)]. Pass [] to disable; promptInjectionValidator
  // is opt-in (false-positive risk varies by domain).
  inputValidators?: InputValidator[];
  // Per-session cumulative-cost ceiling (USD). Checked at the start of each
  // run(); the turn is rejected with NiatoBudgetExceededError before any
  // tokens are spent. Mid-turn throttling is deferred to a later phase
  // (the SDK does not currently expose per-tool-call cost estimation).
  costLimitUsd?: number;
  // Phase 7 telemetry hook. Invoked after each turn with the freshly-built
  // TurnRecord. Errors thrown here are caught and logged at warn level —
  // telemetry must never break user flows. Wire OTel / Datadog /
  // Honeycomb / your own time-series store from here.
  onTurnComplete?: (trace: TurnRecord) => void | Promise<void>;
  // Level 1 persona. Configurable user-facing identity layer prepended
  // to the orchestrator's system prompt — see src/core/persona.ts. Per-
  // user / multi-tenant persona is Level 2; persistent companion memory
  // is Level 3.
  persona?: Persona;
  // Tier 2 long-term memory. Opt-in by presence — when omitted, no
  // preamble is injected and no store is initialized (identical to
  // how persona is handled). Pluggable via `store`; userId resolution
  // is `memory.userId` → `Config.NIATO_USER_ID` → `"default"`. One
  // Niato instance is one user; userId is NOT accepted per-turn on
  // run(). See src/memory/long-term.ts.
  memory?: {
    store?: MemoryStore;
    userId?: string;
  };
  config?: Config;
  logger?: Logger;
  // Internal seam: lets tests substitute the orchestrator runner. Production
  // callers should leave this undefined — it defaults to runOrchestrator.
  orchestratorRunner?: typeof runOrchestrator;
  // ApprovalChannel wired into the SDK's canUseTool. When set, hooks
  // returning permissionDecision: 'ask' surface as ApprovalRequests on
  // this channel; UI consumers (TUI LivePanel) resolve them via keypress.
  // Omit for headless deployments — Niato then installs its built-in
  // headlessDenyCanUseTool which auto-denies any 'ask' decision,
  // making the deny-on-ask safety posture explicit and SDK-version-
  // independent rather than inferred from SDK fallback behavior.
  approval?: ApprovalChannel | undefined;
}

export function ensureBudget(
  session: SessionContext,
  limitUsd: number | undefined,
): void {
  if (limitUsd === undefined) return;
  const cumulative = session.metrics.cumulativeCostUsd;
  if (cumulative >= limitUsd) {
    throw new NiatoBudgetExceededError(cumulative, limitUsd);
  }
}

export interface NiatoTurn {
  result: string;
  classification: IntentResult;
  session: SessionContext;
  messages: SDKMessage[];
  trace: TurnRecord;
}

export interface Niato {
  run(userInput: string, sessionId?: string): Promise<NiatoTurn>;
  // Streaming variant. Identical to run() except onEvent is invoked for
  // every NiatoEvent emitted during the turn (turn_start before
  // classification; classified after; specialist_dispatched / tool_call /
  // tool_result / approval_* during; turn_complete after the trace is
  // built). Errors thrown by onEvent are caught and (when the Niato has
  // a logger) logged at warn — never propagated.
  runStream(
    userInput: string,
    sessionId: string | undefined,
    onEvent: (event: NiatoEvent) => void,
  ): Promise<NiatoTurn>;
  // Returns the rolling per-session metrics aggregated across every turn
  // run() has completed for the given session. Returns undefined when the
  // session is unknown (e.g. never created or evicted).
  metrics(sessionId: string): SessionMetrics | undefined;
  // Append facts to the user's long-term memory. Mutates the in-memory
  // record, re-serializes the cached preamble (so the next turn sees the
  // new facts without busting the prompt cache for unrelated turns), and
  // persists to the configured MemoryStore. No-ops when `memory` was not
  // configured at createNiato(). Soft-capped at MAX_FACTS / ~4KB; on
  // overflow the oldest facts are dropped with a `warn` log.
  remember(facts: string[]): Promise<void>;
}

// Builds the canUseTool callback that bridges the SDK's permission
// system to a TUI-owned ApprovalChannel. Hooks returning
// permissionDecision: 'ask' cause the SDK to call this with the hook's
// decisionReason; we forward it to the channel and translate the
// resolved ApprovalDecision back into the SDK's PermissionResult.
//
// The `turnId` is used as a fallback approvalId namespace if the SDK's
// per-tool toolUseID is missing — that should never happen in practice
// but defends against future SDK contract drift.
// Defensive default canUseTool used when no ApprovalChannel is wired.
// Hooks returning permissionDecision: 'ask' would otherwise depend on
// undocumented SDK fallback behavior; this makes the deny-on-ask
// posture explicit. Surfaces the hook's decisionReason back to the
// orchestrator so it can replan.
const headlessDenyCanUseTool: CanUseTool = (toolName, _input, ctx) =>
  Promise.resolve({
    behavior: "deny",
    message:
      ctx.decisionReason !== undefined
        ? `${toolName}: ${ctx.decisionReason} (no approval channel wired; denied by default)`
        : `${toolName}: denied by default (no approval channel wired)`,
  });

function buildCanUseTool(
  channel: ApprovalChannel,
  turnId: string,
): CanUseTool {
  return async (toolName, input, ctx) => {
    // Cast: ctx.toolUseID is documented as a required string in the SDK
    // CanUseTool ctx param; we widen to unknown so the runtime
    // typeof check has type-level meaning and defends against
    // future SDK contract drift.
    const ctxToolUseId = (ctx as { toolUseID?: unknown }).toolUseID;
    const approvalId =
      typeof ctxToolUseId === "string"
        ? ctxToolUseId
        : `${turnId}:${toolName}`;
    const decision: ApprovalDecision = await channel.request(
      {
        approvalId,
        toolName,
        toolInput: input,
        reason: ctx.decisionReason ?? "approval requested",
      },
      ctx.signal,
    );
    if (decision.decision === "allow") {
      return { behavior: "allow" };
    }
    return {
      behavior: "deny",
      message: decision.reason ?? "denied by user",
    };
  };
}

export function createNiato(options: NiatoOptions): Niato {
  const config = options.config ?? loadConfig();
  const logger =
    options.logger ?? createConsoleLogger(config.NIATO_LOG_LEVEL);
  // Phase 9: log which auth mode the SDK will use so the path is never
  // ambiguous. Both modes go through the Agent SDK's auto-resolution;
  // this is purely an operational signal for the user.
  const authMode = resolveAuthMode(config);
  logger.log("info", "auth mode", { mode: authMode });
  const classifier =
    options.classifier ??
    createSonnetClassifier({
      packs: options.packs,
    });
  const sessions = new InMemorySessionStore();

  if (options.packs.length === 0) {
    throw new Error("createNiato: at least one DomainPack is required");
  }

  // Pre-create the SDK sessions directory. The Agent SDK spawns its child
  // process at this cwd; a non-existent path causes a misleading
  // "Claude Code native binary not found" error from the SDK's onExit
  // handler. Idempotent — recursive: true makes existing dirs a no-op.
  mkdirSync(NIATO_SDK_SESSIONS_DIR, { recursive: true });

  const orchestratorRun = options.orchestratorRunner ?? runOrchestrator;
  const orchestratorHooks = mergeHooks(
    options.globalHooks ?? {},
    ...options.packs.map((p) => p.hooks ?? {}),
  );
  const validators = options.inputValidators ?? [maxLengthValidator(32_000)];

  // Tier 2 long-term memory wiring. Opt-in by presence: when
  // `options.memory` is undefined, no store is initialized, no preamble
  // is built, and `remember()` is a no-op. The factory closure caches
  // both the live record and its serialized preamble — the latter so
  // every turn passes an identical string into the orchestrator's
  // system prompt and the SDK's prompt cache stays warm. Re-reading
  // the file each turn would bust the cache.
  //
  // The MemoryStore interface is async, so the factory kicks off the
  // initial load and stores the Promise. run() awaits it once (the
  // promise resolves long before the SDK query returns; subsequent
  // turns await an already-settled promise = ~0ms). remember() chains
  // off the same load promise to avoid racing with a slow first read.
  let memoryRecord: LongTermMemoryRecord | undefined;
  let memoryPreamble: string | undefined;
  let memoryStore: MemoryStore | undefined;
  let memoryUserId: string | undefined;
  let memoryReady: Promise<void> = Promise.resolve();
  if (options.memory !== undefined) {
    memoryStore = options.memory.store ?? new FileMemoryStore();
    // Resolution order: memory.userId → Config.NIATO_USER_ID. The latter
    // already defaults to "default" via the zod schema, so no further
    // fallback is needed here.
    memoryUserId = options.memory.userId ?? config.NIATO_USER_ID;
    const store = memoryStore;
    const userId = memoryUserId;
    memoryReady = (async (): Promise<void> => {
      try {
        const loaded = await loadOrInitMemory(store, userId);
        memoryRecord = loaded;
        memoryPreamble = buildMemoryPreamble(loaded.facts);
      } catch (err) {
        // Defensive: a malformed file or permission error must not
        // crash startup. Log at warn and leave memory unset — the
        // user gets a working Niato with no remembered facts rather
        // than no Niato at all.
        memoryRecord = { version: 1, facts: [], updatedAt: "" };
        memoryPreamble = "";
        logger.log("warn", "long-term memory: load failed", {
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }

  // Shared turn body for both run() and runStream(). The only difference
  // between the two public methods is whether intermediate NiatoEvents
  // are surfaced — run() passes a noop sink; runStream() forwards them.
  // Extracted as a closure so it captures the same factory state (logger,
  // sessions, classifier, orchestratorRun, hooks, memory*) without a
  // long parameter list at the call sites.
  async function runInternal(
    userInput: string,
    sessionId: string | undefined,
    onEvent: (event: NiatoEvent) => void,
  ): Promise<NiatoTurn> {
    for (const validator of validators) {
      const result = validator(userInput);
      if (!result.ok) {
        throw new NiatoInputRejectedError(result.reason);
      }
    }

    const session = sessions.getOrCreate(sessionId);
    ensureBudget(session, options.costLimitUsd);

    // Make sure the initial memory load (if memory is configured)
    // has resolved before we compose the system prompt. The promise
    // is settled after the first turn, so this is a no-op on every
    // subsequent run().
    await memoryReady;

    const turnId = randomUUID();
    const startedAt = Date.now();

    onEvent({
      type: "turn_start",
      sessionId: session.id,
      turnId,
      userInput,
    });

    // Wrap the post-turn_start body so any throw (classifier, orchestrator,
    // trace builder) emits a terminal turn_failed event before re-raising.
    // Without this the consumer (LivePanel) would see turn_start with no
    // matching terminal signal and stay in the running state. session.started
    // is intentionally flipped INSIDE the try after a successful
    // orchestratorRun, preserving the existing invariant that a thrown
    // turn never leaves the session in a resume-but-not-yet-started state.
    try {
      logger.log("info", "turn start", {
        sessionId: session.id,
        turnId,
        turn: session.metrics.turnCount + 1,
      });

      const classification = await classifier.classify(userInput);
      logger.log("debug", "classification", { classification });
      onEvent({ type: "classified", classification });

      // First turn of a session uses sessionId; subsequent turns use resume.
      // The SDK's Options.sessionId and Options.resume are mutually exclusive.
      const sessionArg = session.started
        ? { resume: session.id }
        : { sessionId: session.id };

      // Always wire a canUseTool. When `options.approval` is configured,
      // route to the TUI ApprovalChannel; otherwise use a defensive
      // built-in that auto-denies. This makes the safety property
      // explicit (CLAUDE.md §5: hooks are enforcement, not logging)
      // rather than inferring it from undocumented SDK behavior on
      // permissionDecision: 'ask' without a canUseTool callback.
      const canUseTool: CanUseTool =
        options.approval !== undefined
          ? buildCanUseTool(options.approval, turnId)
          : headlessDenyCanUseTool;

      const orchestratorResult = await orchestratorRun({
        userInput,
        classification,
        packs: options.packs,
        hooks: orchestratorHooks,
        cwd: NIATO_SDK_SESSIONS_DIR,
        onEvent,
        logger,
        canUseTool,
        ...sessionArg,
        ...(options.persona !== undefined ? { persona: options.persona } : {}),
        ...(memoryPreamble !== undefined && memoryPreamble.length > 0
          ? { memoryPreamble }
          : {}),
      });

      // Flip the started flag AFTER a successful turn so a thrown
      // orchestrator (or any pre-turn rejection like
      // NiatoBudgetExceededError) doesn't leave the session in an
      // inconsistent resume-but-not-yet-started state.
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
      // Single source of truth for per-session aggregates: turnCount,
      // cumulative cost / latency, hook counts, error count all live in
      // session.metrics and are folded in by updateSessionMetrics.
      updateSessionMetrics(session.metrics, trace);
      logger.log("info", "turn", { ...trace });

      if (options.onTurnComplete !== undefined) {
        try {
          await options.onTurnComplete(trace);
        } catch (err) {
          // Telemetry callbacks must never break user flows. Log at warn
          // level and continue — the user still gets their turn result.
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
    } catch (err) {
      onEvent({
        type: "turn_failed",
        turnId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  return {
    async run(userInput, sessionId) {
      return runInternal(userInput, sessionId, () => undefined);
    },
    async runStream(userInput, sessionId, onEvent) {
      return runInternal(userInput, sessionId, onEvent);
    },
    metrics(sessionId) {
      const m = sessions.get(sessionId)?.metrics;
      // structuredClone defends against callers mutating the live ledger
      // (e.g. `niato.metrics(id).guardrailsTriggered["Bash"] = 0` to
      // "reset" a dashboard view would silently corrupt the session's
      // running state). Telemetry callers do this kind of thing.
      return m === undefined ? undefined : structuredClone(m);
    },
    async remember(facts) {
      // No-op when memory wasn't opted in. Returning silently keeps the
      // public API ergonomic for callers that conditionally configure
      // memory (e.g. dev vs prod). Only the opt-in check happens
      // before the await — checking memoryRecord here would race the
      // initial load and silently drop facts when remember() is
      // called before the first run().
      if (memoryStore === undefined || memoryUserId === undefined) {
        return;
      }
      // Wait for the initial load to settle before mutating — otherwise
      // a fast remember() right after createNiato() could race the read
      // and overwrite legitimate facts with an empty record.
      await memoryReady;
      const cleaned = facts
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
      if (cleaned.length === 0) return;
      // After memoryReady has settled both the success and catch
      // branches have populated memoryRecord — undefined here would be
      // a programming error, so bail with a warn and a fresh record
      // rather than swallowing the write silently.
      if (memoryRecord === undefined) {
        logger.log("warn", "long-term memory: record missing after load", {
          userId: memoryUserId,
        });
        memoryRecord = { version: 1, facts: [], updatedAt: "" };
      }
      const merged = [...memoryRecord.facts, ...cleaned];
      const { facts: capped, dropped } = applyFactCap(merged);
      if (dropped > 0) {
        logger.log("warn", "long-term memory: cap reached, dropped oldest", {
          userId: memoryUserId,
          dropped,
          retained: capped.length,
        });
      }
      const next: LongTermMemoryRecord = {
        version: 1,
        facts: capped,
        updatedAt: new Date().toISOString(),
      };
      // Mutate the closure cache BEFORE awaiting the write. This is
      // safe because we've already awaited memoryReady; further
      // remember() calls observe the updated state immediately, and
      // the next run() picks up the new preamble even if the disk
      // write is still in flight.
      memoryRecord = next;
      memoryPreamble = buildMemoryPreamble(capped);
      await memoryStore.write(memoryUserId, next);
    },
  };
}

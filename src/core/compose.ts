import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { type DomainPack } from "../packs/DomainPack.js";
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
  config?: Config;
  logger?: Logger;
  // Internal seam: lets tests substitute the orchestrator runner. Production
  // callers should leave this undefined — it defaults to runOrchestrator.
  orchestratorRunner?: typeof runOrchestrator;
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
  // Returns the rolling per-session metrics aggregated across every turn
  // run() has completed for the given session. Returns undefined when the
  // session is unknown (e.g. never created or evicted).
  metrics(sessionId: string): SessionMetrics | undefined;
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

  return {
    async run(userInput, sessionId) {
      for (const validator of validators) {
        const result = validator(userInput);
        if (!result.ok) {
          throw new NiatoInputRejectedError(result.reason);
        }
      }

      const session = sessions.getOrCreate(sessionId);
      ensureBudget(session, options.costLimitUsd);

      const turnId = randomUUID();
      const startedAt = Date.now();

      logger.log("info", "turn start", {
        sessionId: session.id,
        turnId,
        turn: session.metrics.turnCount + 1,
      });

      const classification = await classifier.classify(userInput);
      logger.log("debug", "classification", { classification });

      // First turn of a session uses sessionId; subsequent turns use resume.
      // The SDK's Options.sessionId and Options.resume are mutually exclusive.
      const sessionArg = session.started
        ? { resume: session.id }
        : { sessionId: session.id };

      const orchestratorResult = await orchestratorRun({
        userInput,
        classification,
        packs: options.packs,
        hooks: orchestratorHooks,
        cwd: NIATO_SDK_SESSIONS_DIR,
        ...sessionArg,
        ...(options.persona !== undefined ? { persona: options.persona } : {}),
      });

      // Flip the started flag AFTER a successful turn so a thrown orchestrator
      // (or any pre-turn rejection like NiatoBudgetExceededError) doesn't
      // leave the session in an inconsistent resume-but-not-yet-started state.
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

      return {
        result: orchestratorResult.result,
        classification,
        session,
        messages: orchestratorResult.messages,
        trace,
      };
    },
    metrics(sessionId) {
      const m = sessions.get(sessionId)?.metrics;
      // structuredClone defends against callers mutating the live ledger
      // (e.g. `niato.metrics(id).guardrailsTriggered["Bash"] = 0` to
      // "reset" a dashboard view would silently corrupt the session's
      // running state). Telemetry callers do this kind of thing.
      return m === undefined ? undefined : structuredClone(m);
    },
  };
}

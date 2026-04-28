import { randomUUID } from "node:crypto";
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
  NawaituInputRejectedError,
  NawaituBudgetExceededError,
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

export interface NawaituOptions {
  packs: DomainPack[];
  classifier?: Classifier;
  // Hooks applied to every orchestrator session. Each pack may also declare
  // pack-scoped hooks; the orchestrator merges built-in invariants → global
  // hooks → pack hooks (in that order) and passes the result to the SDK.
  globalHooks?: Hooks;
  // Synchronous validators run on the raw user input before classification.
  // First failure aborts the turn with a NawaituInputRejectedError. Default:
  // [maxLengthValidator(32_000)]. Pass [] to disable; promptInjectionValidator
  // is opt-in (false-positive risk varies by domain).
  inputValidators?: InputValidator[];
  // Per-session cumulative-cost ceiling (USD). Checked at the start of each
  // run(); the turn is rejected with NawaituBudgetExceededError before any
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
}

export function ensureBudget(
  session: SessionContext,
  limitUsd: number | undefined,
): void {
  if (limitUsd === undefined) return;
  const cumulative = session.metrics.cumulativeCostUsd;
  if (cumulative >= limitUsd) {
    throw new NawaituBudgetExceededError(cumulative, limitUsd);
  }
}

export interface NawaituTurn {
  result: string;
  classification: IntentResult;
  session: SessionContext;
  messages: SDKMessage[];
  trace: TurnRecord;
}

export interface Nawaitu {
  run(userInput: string, sessionId?: string): Promise<NawaituTurn>;
  // Returns the rolling per-session metrics aggregated across every turn
  // run() has completed for the given session. Returns undefined when the
  // session is unknown (e.g. never created or evicted).
  metrics(sessionId: string): SessionMetrics | undefined;
}

export function createNawaitu(options: NawaituOptions): Nawaitu {
  const config = options.config ?? loadConfig();
  const logger =
    options.logger ?? createConsoleLogger(config.NAWAITU_LOG_LEVEL);
  // Phase 9: log which auth mode the SDK will use so the path is never
  // ambiguous. Both modes go through the Agent SDK's auto-resolution;
  // this is purely an operational signal for the user.
  logger.log("info", "auth mode", { mode: resolveAuthMode(config) });
  const classifier =
    options.classifier ??
    createSonnetClassifier({
      packs: options.packs,
    });
  const sessions = new InMemorySessionStore();

  if (options.packs.length === 0) {
    throw new Error("createNawaitu: at least one DomainPack is required");
  }

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
          throw new NawaituInputRejectedError(result.reason);
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

      const orchestratorResult = await runOrchestrator({
        userInput,
        classification,
        packs: options.packs,
        hooks: orchestratorHooks,
        ...(options.persona !== undefined ? { persona: options.persona } : {}),
      });

      const trace = buildTurnRecord({
        sessionId: session.id,
        turnId,
        classification,
        messages: orchestratorResult.messages,
        latencyMs: Date.now() - startedAt,
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
      // (e.g. `nawaitu.metrics(id).guardrailsTriggered["Bash"] = 0` to
      // "reset" a dashboard view would silently corrupt the session's
      // running state). Telemetry callers do this kind of thing.
      return m === undefined ? undefined : structuredClone(m);
    },
  };
}

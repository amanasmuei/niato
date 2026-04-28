import { randomUUID } from "node:crypto";
import { type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { type DomainPack } from "../packs/DomainPack.js";
import { type Classifier, type IntentResult } from "./classifier/types.js";
import { createHaikuClassifier } from "./classifier/haiku.js";
import { runOrchestrator } from "./orchestrator/orchestrator.js";
import { type Hooks, mergeHooks } from "../guardrails/hooks.js";
import {
  type InputValidator,
  maxLengthValidator,
} from "../guardrails/validators.js";
import { NawaituInputRejectedError } from "../guardrails/errors.js";
import {
  InMemorySessionStore,
  type SessionContext,
} from "../memory/session.js";
import { createConsoleLogger, type Logger } from "../observability/log.js";
import { buildTurnRecord, type TurnRecord } from "../observability/trace.js";
import { loadConfig, type Config } from "./config.js";

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
  config?: Config;
  logger?: Logger;
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
}

export function createNawaitu(options: NawaituOptions): Nawaitu {
  const config = options.config ?? loadConfig();
  const logger =
    options.logger ?? createConsoleLogger(config.NAWAITU_LOG_LEVEL);
  const classifier =
    options.classifier ??
    createHaikuClassifier({
      packs: options.packs,
      apiKey: config.ANTHROPIC_API_KEY,
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
      const turnId = randomUUID();
      const startedAt = Date.now();

      logger.log("info", "turn start", {
        sessionId: session.id,
        turnId,
        turn: session.turnCount + 1,
      });

      const classification = await classifier.classify(userInput);
      logger.log("debug", "classification", { classification });

      const orchestratorResult = await runOrchestrator({
        userInput,
        classification,
        packs: options.packs,
        hooks: orchestratorHooks,
      });

      sessions.touch(session.id);

      const trace = buildTurnRecord({
        sessionId: session.id,
        turnId,
        classification,
        messages: orchestratorResult.messages,
        latencyMs: Date.now() - startedAt,
      });
      logger.log("info", "turn", { ...trace });

      return {
        result: orchestratorResult.result,
        classification,
        session,
        messages: orchestratorResult.messages,
        trace,
      };
    },
  };
}

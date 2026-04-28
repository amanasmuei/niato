import { randomUUID } from "node:crypto";
import { type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { type DomainPack } from "../packs/DomainPack.js";
import { type Classifier, type IntentResult } from "./classifier/types.js";
import { createHaikuClassifier } from "./classifier/haiku.js";
import { runOrchestrator } from "./orchestrator/orchestrator.js";
import { type Hooks } from "../guardrails/hooks.js";
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
  // Accepted for forward compatibility; not yet wired into the orchestrator
  // (Phase 3 — see ARCHITECTURE.md §10).
  hooks?: Hooks;
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
  if (options.hooks !== undefined) {
    logger.log(
      "warn",
      "Phase 1: hooks accepted but not wired through to the orchestrator yet (see ARCHITECTURE.md §10).",
    );
  }

  return {
    async run(userInput, sessionId) {
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

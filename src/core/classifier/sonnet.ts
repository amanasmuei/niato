import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { type DomainPack } from "../../packs/DomainPack.js";
import {
  type Classifier,
  type IntentResult,
  IntentResultSchema,
} from "./types.js";
import { CLASSIFIER_PROMPT } from "./prompt.js";
import { INTENT_RESULT_JSON_SCHEMA } from "./intent-schema.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export interface SonnetClassifierOptions {
  packs: DomainPack[];
  model?: string;
}

// Phase 9: classifier moved off the raw `@anthropic-ai/sdk` (API-key-only)
// onto the Agent SDK's `query()` with Options.outputFormat. Same SDK as the
// orchestrator, so it inherits the same auth resolution: `ANTHROPIC_API_KEY`
// when set, Claude Code OAuth (Max subscription) when not. The cost ceiling
// for the classifier on the API tier moves from ~$0.005 (Haiku) to ~$0.04
// (Sonnet); on subscription this is invisible.
export function createSonnetClassifier(
  options: SonnetClassifierOptions,
): Classifier {
  if (options.packs.length === 0) {
    throw new Error(
      "createSonnetClassifier: at least one DomainPack is required",
    );
  }
  const systemPrompt = `${CLASSIFIER_PROMPT}\n\n${buildPackVocabulary(options.packs)}`;
  const model = options.model ?? DEFAULT_MODEL;

  return {
    async classify(input: string): Promise<IntentResult> {
      const queryOptions: Options = {
        model,
        systemPrompt,
        // OAuth path's structured-output flow needs ≥2 turns for the SDK to
        // finalize json_schema results. API-key path completes in 1, but the
        // higher ceiling is harmless: the model still exits early when the
        // structured output is ready.
        maxTurns: 2,
        settingSources: [],
        outputFormat: {
          type: "json_schema",
          schema: INTENT_RESULT_JSON_SCHEMA,
        },
      };

      let structured: unknown = null;
      for await (const msg of query({ prompt: input, options: queryOptions })) {
        if (msg.type === "result" && msg.subtype === "success") {
          const candidate = (msg as { structured_output?: unknown })
            .structured_output;
          if (candidate !== undefined && candidate !== null) {
            structured = candidate;
          }
        }
      }

      if (structured === null) {
        throw new Error(
          "Sonnet classifier did not return a structured_output result",
        );
      }
      return IntentResultSchema.parse(structured);
    },
  };
}

function buildPackVocabulary(packs: DomainPack[]): string {
  const lines: string[] = ["# Available packs", ""];
  for (const pack of packs) {
    lines.push(`## ${pack.name}`);
    lines.push(pack.description);
    lines.push("");
    lines.push("Intents:");
    for (const intent of pack.intents) {
      lines.push(`- \`${intent.name}\` — ${intent.description}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

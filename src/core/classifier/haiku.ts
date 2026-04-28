import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { type DomainPack } from "../../packs/DomainPack.js";
import {
  type Classifier,
  type IntentResult,
  IntentResultSchema,
} from "./types.js";
import { CLASSIFIER_PROMPT } from "./prompt.js";

const DEFAULT_MODEL = "claude-haiku-4-5";

// Anthropic structured outputs reject `additionalProperties: {}` (which
// `z.record(z.string(), z.unknown())` produces), so the classifier API
// schema drops `entities`. Downstream code keeps using IntentResultSchema
// — entities just stays undefined for Phase 2.
const ClassifierOutputSchema = IntentResultSchema.omit({ entities: true });

export interface HaikuClassifierOptions {
  packs: DomainPack[];
  apiKey: string;
  model?: string;
}

export function createHaikuClassifier(
  options: HaikuClassifierOptions,
): Classifier {
  if (options.packs.length === 0) {
    throw new Error("createHaikuClassifier: at least one DomainPack is required");
  }
  const client = new Anthropic({ apiKey: options.apiKey });
  const model = options.model ?? DEFAULT_MODEL;
  const systemPrompt = `${CLASSIFIER_PROMPT}\n\n${buildPackVocabulary(options.packs)}`;

  return {
    async classify(input: string): Promise<IntentResult> {
      const response = await client.messages.parse({
        model,
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: input }],
        output_config: {
          format: zodOutputFormat(
            ClassifierOutputSchema as unknown as z.ZodType<
              z.infer<typeof ClassifierOutputSchema>
            >,
          ),
        },
      });

      const parsed = response.parsed_output;
      if (parsed === null) {
        throw new Error(
          "Haiku classifier returned a response that failed schema validation",
        );
      }
      return IntentResultSchema.parse(parsed);
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

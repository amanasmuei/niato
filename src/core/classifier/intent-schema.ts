// Hand-written JSON Schema for IntentResult. Used by the Sonnet classifier
// as Options.outputFormat.schema. Mirrors IntentResultSchema in types.ts
// minus the `entities` field (Anthropic structured outputs reject schemas
// containing `additionalProperties: {}`, which Zod's record(string, unknown)
// would emit). The classifier-schema regression test pins this contract.
//
// Kept hand-written rather than zod-to-json-schema-converted for two
// reasons: zero new dependencies, and the field set is small enough that a
// future change is more likely to be noticed (and reviewed) when both
// schemas need updating.
export const INTENT_RESULT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    intent: { type: "string", minLength: 1 },
    domain: { type: "string", minLength: 1 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    urgency: { type: "string", enum: ["low", "normal", "high"] },
    secondary: {
      type: "array",
      items: {
        type: "object",
        properties: {
          intent: { type: "string", minLength: 1 },
          domain: { type: "string", minLength: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["intent", "domain", "confidence"],
      },
    },
  },
  required: ["intent", "domain", "confidence"],
};

import { describe, expect, it } from "vitest";
import { INTENT_RESULT_JSON_SCHEMA } from "../src/core/classifier/intent-schema.js";

// Phase 9: Anthropic structured outputs reject schemas containing
// `additionalProperties: {}`. The Phase 4 lock previously asserted this
// against the Zod-derived schema; Phase 9 retargets it at the hand-
// written INTENT_RESULT_JSON_SCHEMA we now feed to Options.outputFormat.
// A regression here breaks every classifier call (API or OAuth).

function jsonSchemaStringContainsForbiddenAdditionalProperties(
  schema: unknown,
): boolean {
  return JSON.stringify(schema).includes('"additionalProperties":{}');
}

describe("INTENT_RESULT_JSON_SCHEMA", () => {
  it("does not emit `additionalProperties: {}` (which Anthropic rejects)", () => {
    expect(
      jsonSchemaStringContainsForbiddenAdditionalProperties(
        INTENT_RESULT_JSON_SCHEMA,
      ),
    ).toBe(false);
  });

  it("declares the cross-pack `secondary` array property", () => {
    const serialized = JSON.stringify(INTENT_RESULT_JSON_SCHEMA);
    expect(serialized).toContain("secondary");
    // Multi-domain output must reach the API as an actual array property,
    // not get silently pruned by the schema definition.
    expect(serialized).toContain('"type":"array"');
  });

  it("requires intent / domain / confidence as the primary classification", () => {
    const required = (
      INTENT_RESULT_JSON_SCHEMA as { required: string[] }
    ).required;
    expect(required).toEqual(["intent", "domain", "confidence"]);
  });
});

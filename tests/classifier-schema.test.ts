import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { IntentResultSchema } from "../src/core/classifier/types.js";

// Offline regression: Anthropic structured outputs reject schemas
// containing `"additionalProperties": {}` (which Zod's `.record(string,
// unknown())` produces). The classifier already drops `entities` from
// the API schema for this reason — but Phase 6 added `secondary` as an
// array of objects. This test snapshot-checks the JSON Schema produced
// by `zodOutputFormat` to make sure no `additionalProperties: {}` slips
// in: a regression here breaks every live classifier call.

const ClassifierOutputSchema = IntentResultSchema.omit({ entities: true });

function jsonSchemaStringContainsForbiddenAdditionalProperties(
  schema: unknown,
): boolean {
  // Stringify the entire format-output. Forbidden shape is the literal
  // "additionalProperties": {}. Strict check; deliberately not regex.
  return JSON.stringify(schema).includes('"additionalProperties":{}');
}

describe("classifier zodOutputFormat", () => {
  it("does not emit `additionalProperties: {}` (which Anthropic structured outputs reject)", () => {
    const fmt = zodOutputFormat(ClassifierOutputSchema);
    expect(jsonSchemaStringContainsForbiddenAdditionalProperties(fmt)).toBe(
      false,
    );
  });

  it("preserves the Phase 6 secondary array in the schema", () => {
    const fmt = zodOutputFormat(ClassifierOutputSchema);
    const serialized = JSON.stringify(fmt);
    // The secondary field must reach the API as an array property; if it
    // got pruned by the schema transformation, multi-domain output never
    // makes it to the classifier.
    expect(serialized).toContain("secondary");
  });
});

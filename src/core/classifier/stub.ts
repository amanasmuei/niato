import {
  type Classifier,
  type IntentResult,
  IntentResultSchema,
} from "./types.js";

// Phase 1 placeholder. Phase 2 replaces this with a real Haiku 4.5 call.
// The shape returned here matches what the real classifier will produce so
// callers can be written against it now.
export const stubClassifier: Classifier = {
  classify(_input: string): IntentResult {
    return IntentResultSchema.parse({
      intent: "question",
      domain: "generic",
      confidence: 0.95,
    });
  },
};

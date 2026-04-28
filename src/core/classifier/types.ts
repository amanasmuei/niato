import { z } from "zod";

export const IntentResultSchema = z.object({
  intent: z.string().min(1),
  domain: z.string().min(1),
  confidence: z.number().min(0).max(1),
  entities: z.record(z.string(), z.unknown()).optional(),
});

export type IntentResult = z.infer<typeof IntentResultSchema>;

export interface Classifier {
  classify(input: string): Promise<IntentResult> | IntentResult;
}

import { z } from "zod";

// One additional (intent, domain, confidence) triple beyond the primary,
// populated when a single user message genuinely spans multiple packs.
// See ARCHITECTURE.md §7.4 — e.g. "the refund webhook is broken — find
// the bug and open a ticket" returns primary={dev_tools, fix_bug} plus
// secondary=[{support, complaint}].
export const SecondaryIntentSchema = z.object({
  intent: z.string().min(1),
  domain: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export type SecondaryIntent = z.infer<typeof SecondaryIntentSchema>;

export const IntentResultSchema = z.object({
  intent: z.string().min(1),
  domain: z.string().min(1),
  confidence: z.number().min(0).max(1),
  urgency: z.enum(["low", "normal", "high"]).optional(),
  // Phase 6: optional cross-pack recommendations beyond the primary.
  // Backward-compatible — single-domain queries leave this undefined.
  secondary: z.array(SecondaryIntentSchema).optional(),
  entities: z.record(z.string(), z.unknown()).optional(),
});

export type IntentResult = z.infer<typeof IntentResultSchema>;

export interface Classifier {
  classify(input: string): Promise<IntentResult> | IntentResult;
}

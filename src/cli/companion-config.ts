import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

// Persisted companion configuration. Lives at ~/.nawaitu/companion.json by
// default; the chat CLI loads it on every run, falling back to the setup
// wizard when missing or invalid. The shape is versioned so future
// migrations (richer voice options, per-tool persona overrides, etc.)
// don't silently corrupt older files.

export const VOICE_ARCHETYPES = ["warm", "direct", "playful"] as const;
export type VoiceArchetype = (typeof VOICE_ARCHETYPES)[number];

export const CompanionSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  userName: z.string().optional(),
  voice: z.enum(VOICE_ARCHETYPES),
  extraDescription: z.string().optional(),
  createdAt: z.string().min(1),
});

export type Companion = z.infer<typeof CompanionSchema>;

export function defaultCompanionPath(): string {
  return join(homedir(), ".nawaitu", "companion.json");
}

// Returns null on missing file OR malformed file. The wizard handles
// both cases the same way (re-run setup) — no need to distinguish.
export function loadCompanion(
  path: string = defaultCompanionPath(),
): Companion | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    return CompanionSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveCompanion(
  companion: Companion,
  path: string = defaultCompanionPath(),
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(companion, null, 2)}\n`, "utf8");
}

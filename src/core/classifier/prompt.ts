import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load adjacent prompt.md once at module init. Mirrors the orchestrator's
// loader. If `pnpm build` is used in later phases, a post-build step needs
// to copy *.md from src/ to dist/.
const here = dirname(fileURLToPath(import.meta.url));
export const CLASSIFIER_PROMPT: string = readFileSync(
  join(here, "prompt.md"),
  "utf8",
);

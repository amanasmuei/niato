import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load adjacent prompt.md once at module init. Synchronous on purpose:
// this runs at startup and the prompt is small. If `pnpm build` is used in
// later phases, a post-build step needs to copy *.md from src/ to dist/.
const here = dirname(fileURLToPath(import.meta.url));
export const ORCHESTRATOR_PROMPT: string = readFileSync(
  join(here, "prompt.md"),
  "utf8",
);

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load each specialist's adjacent prompt.md once at module init. Mirrors the
// classifier and orchestrator loaders. Skill content is rolled into these
// prompts because the SDK's skill loader requires filesystem discovery via
// `settingSources`, and our orchestrator runs with `settingSources: []` per
// the architectural invariant — see ARCHITECTURE.md §10 / sdk.d.ts:1635.
const here = dirname(fileURLToPath(import.meta.url));

function loadPrompt(name: string): string {
  return readFileSync(join(here, `${name}.md`), "utf8");
}

export const TICKET_LOOKUP_PROMPT = loadPrompt("ticket_lookup");
export const REFUND_PROCESSOR_PROMPT = loadPrompt("refund_processor");
export const KB_SEARCH_PROMPT = loadPrompt("kb_search");
export const ESCALATE_PROMPT = loadPrompt("escalate");

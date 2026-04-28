import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load each specialist's adjacent prompt.md once at module init. Same
// pattern as the Generic / Support pack prompt loaders. Skill content
// (code-conventions, brand voice analogues) is rolled into prompts because
// AgentDefinition.skills requires filesystem discovery via settingSources,
// which we explicitly opt out of (CLAUDE.md invariant).
const here = dirname(fileURLToPath(import.meta.url));

function loadPrompt(name: string): string {
  return readFileSync(join(here, `${name}.md`), "utf8");
}

export const CODEBASE_SEARCH_PROMPT = loadPrompt("codebase_search");
export const CODE_EXPLAINER_PROMPT = loadPrompt("code_explainer");
export const BUG_FIXER_PROMPT = loadPrompt("bug_fixer");
export const CI_DEBUGGER_PROMPT = loadPrompt("ci_debugger");

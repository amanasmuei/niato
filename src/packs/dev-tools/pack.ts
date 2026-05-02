import { type DomainPack, type IntentDefinition } from "../DomainPack.js";
import { codebaseSearchAgent } from "./agents/codebase_search.js";
import { codeExplainerAgent } from "./agents/code_explainer.js";
import { bugFixerAgent } from "./agents/bug_fixer.js";
import { ciDebuggerAgent } from "./agents/ci_debugger.js";
import { prCreatorAgent } from "./agents/pr_creator.js";
import {
  DEV_TOOLS_GITHUB_STUB_SERVER_NAME,
  devToolsGithubStubServer,
} from "./tools/dev_tools_github_stub.js";
import { devToolsHooks } from "./hooks/index.js";

const intents: IntentDefinition[] = [
  { name: "find_code", description: "Locate code matching a description" },
  { name: "explain_code", description: "Explain how a piece of code works" },
  { name: "fix_bug", description: "Diagnose or fix a bug" },
  { name: "debug_ci", description: "Investigate a CI failure" },
  { name: "create_pr", description: "Open a pull request" },
];

const intentToSpecialist: Record<string, string> = {
  find_code: "codebase_search",
  explain_code: "code_explainer",
  fix_bug: "bug_fixer",
  debug_ci: "ci_debugger",
  create_pr: "pr_creator",
};

export const devToolsPack: DomainPack = {
  name: "dev_tools",
  description:
    "Engineering tasks: code search, explanation, bug fixing, CI debugging, and pull-request creation via a stub GitHub MCP (real wiring is a future release concern).",
  intents,
  agents: {
    codebase_search: codebaseSearchAgent,
    code_explainer: codeExplainerAgent,
    bug_fixer: bugFixerAgent,
    ci_debugger: ciDebuggerAgent,
    pr_creator: prCreatorAgent,
  },
  mcpServers: {
    [DEV_TOOLS_GITHUB_STUB_SERVER_NAME]: devToolsGithubStubServer,
  },
  hooks: devToolsHooks,
  route: (intent) => intentToSpecialist[intent.intent] ?? null,
};

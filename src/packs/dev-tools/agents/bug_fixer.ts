import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { BuiltinTools } from "../../../tools/builtin.js";
import { BUG_FIXER_PROMPT } from "../prompts/index.js";

export const bugFixerAgent: AgentDefinition = {
  description:
    "Diagnoses and fixes bugs. Read, Edit, and a sandbox-restricted Bash limited to running tests. Gated by sandboxBashHook (test-runners only) and secretsScanHook (denies tool input containing AWS/GitHub/sk- shaped keys).",
  prompt: BUG_FIXER_PROMPT,
  tools: [BuiltinTools.Read, BuiltinTools.Edit, BuiltinTools.Bash],
  model: "claude-sonnet-4-6",
};

import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { BuiltinTools } from "../../../tools/builtin.js";
import { CODEBASE_SEARCH_PROMPT } from "../prompts/index.js";

export const codebaseSearchAgent: AgentDefinition = {
  description:
    "Read-only code search and navigation. Use when the user asks where something lives in the codebase, what calls what, or to locate examples of a pattern.",
  prompt: CODEBASE_SEARCH_PROMPT,
  tools: [BuiltinTools.Read, BuiltinTools.Grep, BuiltinTools.Glob],
  model: "claude-sonnet-4-6",
};

import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { BuiltinTools } from "../../../tools/builtin.js";
import { CODE_EXPLAINER_PROMPT } from "../prompts/index.js";

export const codeExplainerAgent: AgentDefinition = {
  description:
    "Read-only code explanation. Use when the user asks how a piece of code works, why a pattern was chosen, or to walk through a control flow.",
  prompt: CODE_EXPLAINER_PROMPT,
  tools: [BuiltinTools.Read, BuiltinTools.Grep],
  model: "claude-sonnet-4-6",
};

import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { BuiltinTools } from "../../../tools/builtin.js";
import { CI_DEBUGGER_PROMPT } from "../prompts/index.js";

export const ciDebuggerAgent: AgentDefinition = {
  description:
    "Investigates CI failures. Reads local logs, fetches public CI URLs, and surfaces a likely root cause. Read-only — patch suggestions are fine, but applying them is the bug_fixer specialist's job.",
  prompt: CI_DEBUGGER_PROMPT,
  tools: [BuiltinTools.Read, BuiltinTools.Grep, BuiltinTools.WebFetch],
  model: "claude-sonnet-4-6",
};

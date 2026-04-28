import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { SupportStubTools } from "../tools/support_stub.js";
import { KB_SEARCH_PROMPT } from "../prompts/index.js";

export const kbSearchAgent: AgentDefinition = {
  description:
    "Read-only knowledge-base search. Use for billing questions, account help, and policy explanations the user can resolve themselves with the right information.",
  prompt: KB_SEARCH_PROMPT,
  tools: [SupportStubTools.search_kb],
  model: "claude-sonnet-4-6",
};

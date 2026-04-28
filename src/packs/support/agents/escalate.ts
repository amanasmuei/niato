import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { SupportStubTools } from "../tools/support_stub.js";
import { ESCALATE_PROMPT } from "../prompts/index.js";

export const escalateAgent: AgentDefinition = {
  description:
    "Creates a structured priority ticket summarizing the conversation and pages on-call when severity is high. Use for complaints and any case the other Support specialists cannot resolve.",
  prompt: ESCALATE_PROMPT,
  tools: [SupportStubTools.create_priority_ticket],
  model: "claude-sonnet-4-6",
};

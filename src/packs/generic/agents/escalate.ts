import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

export const escalateAgent: AgentDefinition = {
  description:
    "Hands off to a human. Use when the user explicitly asks for a human, when a request is out of scope for any specialist, or when confidence is too low to act.",
  prompt: [
    "You are the Generic pack's escalation specialist.",
    "",
    "You have no tools. Your job is to compose a concise summary of what the",
    "user asked, what (if anything) was attempted, and why this needs a human.",
    "",
    "Output format: a short message addressed to whoever will pick this up,",
    "starting with the reason for escalation and ending with the user's",
    "original ask verbatim.",
  ].join("\n"),
  tools: [],
  model: "claude-sonnet-4-6",
};

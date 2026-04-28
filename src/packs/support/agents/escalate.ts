import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

// Placeholder. Real prompt and MCP tool wiring land in Phase 4 Step 3. Unlike
// Generic's escalate, Support's escalate creates a structured priority ticket
// and (when high severity) pages on-call.
export const escalateAgent: AgentDefinition = {
  description:
    "Creates a priority ticket summarizing the conversation and pages on-call when severity is high. Use for complaints and any case the other specialists cannot resolve.",
  prompt: "Phase 4 placeholder — replaced in Step 3.",
  tools: [],
  model: "claude-sonnet-4-6",
};

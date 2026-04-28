import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

// Placeholder. Real prompt and MCP tool wiring land in Phase 4 Step 3.
export const kbSearchAgent: AgentDefinition = {
  description:
    "Read-only knowledge-base search. Use for billing questions, account help, and policy explanations that can be answered from the support KB.",
  prompt: "Phase 4 placeholder — replaced in Step 3.",
  tools: [],
  model: "claude-sonnet-4-6",
};

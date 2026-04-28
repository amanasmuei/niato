import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

// Placeholder. Real prompt and MCP tool wiring land in Phase 4 Step 3. The
// dollar-limit and PII-redaction hooks gate this specialist's tool calls in
// Step 4.
export const refundProcessorAgent: AgentDefinition = {
  description:
    "Issues refunds. Gated by an approval hook on dollar amount; refunds at or above the auto-approve threshold are denied and routed to escalate.",
  prompt: "Phase 4 placeholder — replaced in Step 3.",
  tools: [],
  model: "claude-sonnet-4-6",
};

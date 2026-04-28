import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

// Placeholder. Real prompt and MCP tool wiring land in Phase 4 Step 3.
export const ticketLookupAgent: AgentDefinition = {
  description:
    "Read-only ticket and order status lookup. Use when the user asks about an existing order, shipment, or ticket.",
  prompt: "Phase 4 placeholder — replaced in Step 3.",
  tools: [],
  model: "claude-sonnet-4-6",
};

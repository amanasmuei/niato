import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { SupportStubTools } from "../tools/support_stub.js";
import { TICKET_LOOKUP_PROMPT } from "../prompts/index.js";

export const ticketLookupAgent: AgentDefinition = {
  description:
    "Read-only ticket and order status lookup. Use when the user asks about an existing order, shipment, or ticket and provides (or can provide) a ticket ID.",
  prompt: TICKET_LOOKUP_PROMPT,
  tools: [SupportStubTools.lookup_ticket],
  model: "claude-sonnet-4-6",
};

import { createHash } from "node:crypto";
import {
  createSdkMcpServer,
  tool,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// In-process stub MCP server. Phase 4 ships canned, deterministic data so the
// dispatch loop and hook gates can be exercised end-to-end without real
// Zendesk / Stripe credentials. A production deployment swaps this out by
// replacing `pack.mcpServers` with real server URLs in createNawaitu config.
//
// Tool surface mirrors ARCHITECTURE.md §7.2:
//   - lookup_ticket          → ticket_lookup specialist
//   - search_kb              → kb_search specialist
//   - issue_refund           → refund_processor specialist (gated by hook)
//   - create_priority_ticket → escalate specialist
//
// Determinism: derive non-trivial fields (refund IDs, ticket IDs) from a hash
// of the input so the same input always produces the same output. Useful for
// eval reproducibility once tool-call assertions land in a later phase.

function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 8).toUpperCase();
}

function textResult(body: string) {
  return {
    content: [{ type: "text" as const, text: body }],
  };
}

const lookupTicketTool = tool(
  "lookup_ticket",
  "Look up a customer support ticket by its ID. Returns the ticket's status, customer email, summary, and timestamps.",
  { ticket_id: z.string().describe("Ticket ID, e.g. TKT-12345") },
  (args) => {
    const id = args.ticket_id.trim();
    if (!/^TKT-/i.test(id)) {
      return Promise.resolve(
        textResult(`Ticket not found: ${id}. Ticket IDs must look like "TKT-12345".`),
      );
    }
    const tag = shortHash(id);
    const body = [
      `Ticket ${id} (open, severity medium)`,
      `Customer: customer-${tag.slice(0, 4).toLowerCase()}@example.com`,
      `Subject: Order inquiry`,
      `Created: 2026-04-22T10:30:00Z`,
      `Last update: 2026-04-26T14:15:00Z`,
      `Assigned agent: none`,
    ].join("\n");
    return Promise.resolve(textResult(body));
  },
);

const searchKbTool = tool(
  "search_kb",
  "Search the support knowledge base. Returns up to three relevant articles with a short excerpt each.",
  { query: z.string().describe("Free-text query") },
  (args) => {
    const tag = shortHash(args.query);
    const body = [
      `Results for "${args.query}":`,
      ``,
      `1. "Refund policy" (kb/${tag.slice(0, 4)}-1)`,
      `   Refunds may be requested within 30 days of purchase. Items must be unused.`,
      ``,
      `2. "How charges appear on your statement" (kb/${tag.slice(0, 4)}-2)`,
      `   Charges may show as ACME*ORDERS or ACME PURCHASES depending on your bank.`,
      ``,
      `3. "Updating account email" (kb/${tag.slice(0, 4)}-3)`,
      `   Sign in, go to Settings → Account, and click Edit next to Email.`,
    ].join("\n");
    return Promise.resolve(textResult(body));
  },
);

const issueRefundTool = tool(
  "issue_refund",
  "Issue a refund against an order. The dollar-limit hook gates this: refunds at or above the auto-approve threshold are denied with a reason that surfaces back to the orchestrator.",
  {
    order_id: z.string().describe("Order ID, e.g. ORD-12345"),
    amount_usd: z.number().positive().describe("Refund amount in USD"),
    reason: z.string().describe("Short reason for the refund"),
  },
  (args) => {
    const refundId = `RF-${shortHash(`${args.order_id}|${args.amount_usd.toFixed(2)}`)}`;
    const body = [
      `Refund issued.`,
      `Refund ID: ${refundId}`,
      `Order: ${args.order_id}`,
      `Amount: $${args.amount_usd.toFixed(2)} USD`,
      `Reason: ${args.reason}`,
    ].join("\n");
    return Promise.resolve(textResult(body));
  },
);

const createPriorityTicketTool = tool(
  "create_priority_ticket",
  "Create a priority support ticket summarizing the conversation. Pages on-call when severity is high.",
  {
    severity: z.enum(["low", "medium", "high"]),
    summary: z.string().describe("One-paragraph summary for the on-call engineer"),
    page_oncall: z
      .boolean()
      .describe(
        "Whether to page on-call. Honored only when severity is 'high'.",
      ),
  },
  (args) => {
    const ticketId = `TKT-${shortHash(args.summary)}`;
    const paged = args.severity === "high" && args.page_oncall;
    const body = [
      `Priority ticket created.`,
      `Ticket ID: ${ticketId}`,
      `Severity: ${args.severity}`,
      `Paged on-call: ${paged ? "yes" : "no"}`,
    ].join("\n");
    return Promise.resolve(textResult(body));
  },
);

export const SUPPORT_STUB_SERVER_NAME = "support_stub";

export const SupportStubTools = {
  lookup_ticket: `mcp__${SUPPORT_STUB_SERVER_NAME}__lookup_ticket`,
  search_kb: `mcp__${SUPPORT_STUB_SERVER_NAME}__search_kb`,
  issue_refund: `mcp__${SUPPORT_STUB_SERVER_NAME}__issue_refund`,
  create_priority_ticket: `mcp__${SUPPORT_STUB_SERVER_NAME}__create_priority_ticket`,
} as const;

export const supportStubServer: McpSdkServerConfigWithInstance =
  createSdkMcpServer({
    name: SUPPORT_STUB_SERVER_NAME,
    version: "0.0.1",
    tools: [
      lookupTicketTool,
      searchKbTool,
      issueRefundTool,
      createPriorityTicketTool,
    ],
  });

// Re-exported for direct unit testing — bypasses the MCP transport so tests
// can call handlers without spinning up the SDK.
export const __supportStubHandlers = {
  lookup_ticket: lookupTicketTool.handler,
  search_kb: searchKbTool.handler,
  issue_refund: issueRefundTool.handler,
  create_priority_ticket: createPriorityTicketTool.handler,
};

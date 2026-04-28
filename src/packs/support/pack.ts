import { type DomainPack, type IntentDefinition } from "../DomainPack.js";
import { ticketLookupAgent } from "./agents/ticket_lookup.js";
import { refundProcessorAgent } from "./agents/refund_processor.js";
import { kbSearchAgent } from "./agents/kb_search.js";
import { escalateAgent } from "./agents/escalate.js";
import {
  SUPPORT_STUB_SERVER_NAME,
  supportStubServer,
} from "./tools/support_stub.js";

const intents: IntentDefinition[] = [
  {
    name: "order_status",
    description: "User asks about an order or shipment",
  },
  { name: "refund_request", description: "User wants a refund" },
  {
    name: "billing_question",
    description: "User has a question about charges",
  },
  { name: "complaint", description: "User expresses dissatisfaction" },
  { name: "account_help", description: "User needs help with their account" },
];

const intentToSpecialist: Record<string, string> = {
  order_status: "ticket_lookup",
  refund_request: "refund_processor",
  billing_question: "kb_search",
  account_help: "kb_search",
  complaint: "escalate",
};

export const supportPack: DomainPack = {
  name: "support",
  description:
    "Customer support: order status, refunds, billing questions, complaints, account help.",
  intents,
  agents: {
    ticket_lookup: ticketLookupAgent,
    refund_processor: refundProcessorAgent,
    kb_search: kbSearchAgent,
    escalate: escalateAgent,
  },
  mcpServers: {
    [SUPPORT_STUB_SERVER_NAME]: supportStubServer,
  },
  route: (intent) => intentToSpecialist[intent.intent] ?? null,
};

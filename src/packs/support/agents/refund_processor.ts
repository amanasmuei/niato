import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { SupportStubTools } from "../tools/support_stub.js";
import { REFUND_PROCESSOR_PROMPT } from "../prompts/index.js";

export const refundProcessorAgent: AgentDefinition = {
  description:
    "Issues refunds against customer orders. Gated by the dollar-limit hook (refunds at or above the auto-approve threshold are denied and routed to escalate) and the PII-redaction hook (denies tool input containing credit-card or SSN patterns).",
  prompt: REFUND_PROCESSOR_PROMPT,
  tools: [SupportStubTools.issue_refund],
  model: "claude-sonnet-4-6",
};

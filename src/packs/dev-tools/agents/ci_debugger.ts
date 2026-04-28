import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

// Placeholder. Real prompt and tool wiring land in Phase 5 Step 2.
export const ciDebuggerAgent: AgentDefinition = {
  description:
    "Investigates CI failures. Reads local logs, fetches public CI URLs, and surfaces a likely root cause. Read-only.",
  prompt: "Phase 5 placeholder — replaced in Step 2.",
  tools: [],
  model: "claude-sonnet-4-6",
};

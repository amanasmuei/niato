import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

// Placeholder. Real prompt and tool wiring land in Phase 5 Step 2.
export const codeExplainerAgent: AgentDefinition = {
  description:
    "Read-only code explanation. Use when the user asks how a piece of code works, why a pattern was chosen, or to walk through a control flow.",
  prompt: "Phase 5 placeholder — replaced in Step 2.",
  tools: [],
  model: "claude-sonnet-4-6",
};

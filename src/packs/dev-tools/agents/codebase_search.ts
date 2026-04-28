import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

// Placeholder. Real prompt and tool wiring land in Phase 5 Step 2.
export const codebaseSearchAgent: AgentDefinition = {
  description:
    "Read-only code search and navigation. Use when the user asks where something lives in the codebase, what calls what, or to locate examples of a pattern.",
  prompt: "Phase 5 placeholder — replaced in Step 2.",
  tools: [],
  model: "claude-sonnet-4-6",
};

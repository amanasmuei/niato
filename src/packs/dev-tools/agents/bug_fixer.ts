import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

// Placeholder. Real prompt and tool wiring land in Phase 5 Step 2. The
// sandbox-bash hook gates this specialist's Bash calls in Step 3 — only
// test-runner commands pass.
export const bugFixerAgent: AgentDefinition = {
  description:
    "Diagnoses and fixes bugs. Read, Edit, and a sandbox-restricted Bash limited to running tests. Use when the user describes a defect to investigate and patch.",
  prompt: "Phase 5 placeholder — replaced in Step 2.",
  tools: [],
  model: "claude-sonnet-4-6",
};

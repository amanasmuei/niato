import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { DevToolsGithubStubTools } from "../tools/dev_tools_github_stub.js";
import { PR_CREATOR_PROMPT } from "../prompts/index.js";

export const prCreatorAgent: AgentDefinition = {
  description:
    "Opens a pull request via the GitHub stub MCP. Single-purpose: PR creation only — no code search, edits, or CI inspection. Gated by protectedBranchGate (PRs into main/master/release/* are denied so a human reviewer can approve).",
  prompt: PR_CREATOR_PROMPT,
  tools: [DevToolsGithubStubTools.create_pull_request],
  model: "claude-sonnet-4-6",
};

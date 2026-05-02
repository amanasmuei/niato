import { createHash } from "node:crypto";
import {
  createSdkMcpServer,
  tool,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// In-process stub MCP server for the Dev Tools pack. Mirrors support_stub.ts:
// canned, deterministic data so the dispatch loop and protectedBranchGate hook
// can be exercised end-to-end without real GitHub credentials. A production
// deployment swaps this out by replacing `pack.mcpServers` with a real GitHub
// MCP server URL in createNiato config.
//
// Tool surface (single tool for now):
//   - create_pull_request(base, head, title, body)
//       → pr_creator specialist, gated by protectedBranchGate hook
//
// Determinism: the fake PR number and URL are derived from a hash of
// (base|head|title) so the same inputs always yield the same PR URL. Useful
// for eval reproducibility and snapshot tests.

function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 8);
}

function textResult(body: string) {
  return {
    content: [{ type: "text" as const, text: body }],
  };
}

const createPullRequestTool = tool(
  "create_pull_request",
  "Open a pull request from the head branch into the base branch. Gated by the protectedBranchGate hook: PRs targeting protected branches (default: main, master, release/*) are denied with a reason that surfaces back to the orchestrator.",
  {
    base: z.string().describe("Target branch (e.g. 'main' or 'develop')"),
    head: z.string().describe("Source branch carrying the changes"),
    title: z.string().describe("PR title — keep under 70 chars"),
    body: z.string().describe("PR body in Markdown"),
  },
  (args) => {
    const tag = shortHash(`${args.base}|${args.head}|${args.title}`);
    // 4-hex-digit slice → integer 0-65535. Keeps PR numbers in a believable
    // range without a separate counter.
    const prNumber = parseInt(tag.slice(0, 4), 16);
    const url = `https://github.example.com/acme/repo/pull/${String(prNumber)}`;
    const body = [
      `Pull request opened.`,
      `URL: ${url}`,
      `PR #${String(prNumber)}: ${args.title}`,
      `Base: ${args.base}`,
      `Head: ${args.head}`,
      `Body:`,
      args.body,
    ].join("\n");
    return Promise.resolve(textResult(body));
  },
);

export const DEV_TOOLS_GITHUB_STUB_SERVER_NAME = "dev_tools_github_stub";

export const DevToolsGithubStubTools = {
  create_pull_request: `mcp__${DEV_TOOLS_GITHUB_STUB_SERVER_NAME}__create_pull_request`,
} as const;

export const devToolsGithubStubServer: McpSdkServerConfigWithInstance =
  createSdkMcpServer({
    name: DEV_TOOLS_GITHUB_STUB_SERVER_NAME,
    version: "0.0.1",
    tools: [createPullRequestTool],
  });

// Re-exported for direct unit testing — bypasses the MCP transport so tests
// can call handlers without spinning up the SDK.
export const __devToolsGithubStubHandlers = {
  create_pull_request: createPullRequestTool.handler,
};

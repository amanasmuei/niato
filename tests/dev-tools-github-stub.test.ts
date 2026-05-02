import { describe, it, expect } from "vitest";
import {
  __devToolsGithubStubHandlers,
  DEV_TOOLS_GITHUB_STUB_SERVER_NAME,
  DevToolsGithubStubTools,
  devToolsGithubStubServer,
} from "../src/packs/dev-tools/tools/dev_tools_github_stub.js";

// The MCP transport is non-trivial to spin up in unit tests; the handlers
// don't depend on it, so we exercise them directly via __devToolsGithubStubHandlers.
// E2E coverage of the full SDK round-trip lives in the dev-tools smoke test.

function textOf(result: { content: { type: string; text?: string }[] }): string {
  const block = result.content[0];
  if (block?.type !== "text" || block.text === undefined) {
    throw new Error("expected a text content block");
  }
  return block.text;
}

function extractUrl(body: string): string | undefined {
  const match = /URL: (https:\/\/\S+)/.exec(body);
  return match?.[1];
}

describe("dev_tools_github_stub MCP server", () => {
  it("declares the documented server name", () => {
    expect(DEV_TOOLS_GITHUB_STUB_SERVER_NAME).toBe("dev_tools_github_stub");
    expect(devToolsGithubStubServer.type).toBe("sdk");
  });

  it("exposes the create_pull_request tool name constant under the mcp__ prefix", () => {
    expect(DevToolsGithubStubTools).toEqual({
      create_pull_request: "mcp__dev_tools_github_stub__create_pull_request",
    });
  });
});

describe("create_pull_request handler", () => {
  it("returns a structured response with a fake PR URL", async () => {
    const result = await __devToolsGithubStubHandlers.create_pull_request(
      {
        base: "develop",
        head: "feat/x",
        title: "Add feature x",
        body: "implements the thing",
      },
      undefined,
    );
    const body = textOf(result);
    expect(body).toMatch(/Pull request opened/);
    expect(body).toMatch(/URL: https:\/\/github\.example\.com\/acme\/repo\/pull\/\d+/);
    expect(body).toContain("Base: develop");
    expect(body).toContain("Head: feat/x");
    expect(body).toContain("Add feature x");
    expect(body).toContain("implements the thing");
  });

  it("is deterministic for the same (base, head, title) inputs", async () => {
    const a = textOf(
      await __devToolsGithubStubHandlers.create_pull_request(
        {
          base: "develop",
          head: "feat/y",
          title: "Same title",
          body: "body 1",
        },
        undefined,
      ),
    );
    const b = textOf(
      await __devToolsGithubStubHandlers.create_pull_request(
        {
          base: "develop",
          head: "feat/y",
          title: "Same title",
          body: "body 2 — different body still hashes the same URL",
        },
        undefined,
      ),
    );
    // PR URL is keyed on (base|head|title) so both calls share the URL.
    expect(extractUrl(a)).toBeDefined();
    expect(extractUrl(a)).toBe(extractUrl(b));
  });

  it("produces different URLs for different inputs", async () => {
    const a = textOf(
      await __devToolsGithubStubHandlers.create_pull_request(
        { base: "main", head: "feat/a", title: "A", body: "" },
        undefined,
      ),
    );
    const b = textOf(
      await __devToolsGithubStubHandlers.create_pull_request(
        { base: "main", head: "feat/b", title: "B", body: "" },
        undefined,
      ),
    );
    expect(extractUrl(a)).not.toBe(extractUrl(b));
  });

  // The handler itself does NOT enforce the protected-branch gate — that's
  // the protectedBranchGate hook's job. The handler runs only after the hook
  // has approved.
  it("does not gate by base branch on its own", async () => {
    const result = await __devToolsGithubStubHandlers.create_pull_request(
      { base: "main", head: "feat/x", title: "t", body: "b" },
      undefined,
    );
    expect(textOf(result)).toMatch(/Pull request opened/);
  });
});

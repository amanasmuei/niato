import { describe, it, expect } from "vitest";
import {
  type HookInput,
  type HookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";
import { protectedBranchGate } from "../src/packs/dev-tools/hooks/protected_branch_gate.js";
import { DevToolsGithubStubTools } from "../src/packs/dev-tools/tools/dev_tools_github_stub.js";

const baseFields = {
  session_id: "test-session",
  transcript_path: "/tmp/transcript",
  cwd: "/tmp",
};

function preToolUseInput(overrides: {
  tool_name: string;
  tool_input: unknown;
}): HookInput {
  return {
    ...baseFields,
    hook_event_name: "PreToolUse",
    tool_name: overrides.tool_name,
    tool_input: overrides.tool_input,
    tool_use_id: "tool-use-1",
  };
}

interface DenyOutcome {
  decision: "deny";
  reason: string;
}

function getPreToolUseDeny(output: HookJSONOutput): DenyOutcome | undefined {
  if (!("hookSpecificOutput" in output)) return undefined;
  const hso = output.hookSpecificOutput;
  if (hso.hookEventName !== "PreToolUse") return undefined;
  if (hso.permissionDecision !== "deny") return undefined;
  return { decision: "deny", reason: hso.permissionDecisionReason ?? "" };
}

const noopOptions = { signal: new AbortController().signal };

describe("protectedBranchGate factory", () => {
  const matcher = protectedBranchGate();
  const [hook] = matcher.hooks;
  if (hook === undefined) {
    throw new Error("protectedBranchGate returned no hook");
  }

  it("matcher field equals the create_pull_request tool name", () => {
    expect(matcher.matcher).toBe(DevToolsGithubStubTools.create_pull_request);
  });

  it("allows a PR into a feature branch (feat/x)", async () => {
    const result = await hook(
      preToolUseInput({
        tool_name: DevToolsGithubStubTools.create_pull_request,
        tool_input: {
          base: "feat/x",
          head: "feat/x-impl",
          title: "Add feature x",
          body: "implements the thing",
        },
      }),
      "tool-use",
      noopOptions,
    );
    expect(result).toEqual({ continue: true });
  });

  it("denies a PR targeting main", async () => {
    const result = await hook(
      preToolUseInput({
        tool_name: DevToolsGithubStubTools.create_pull_request,
        tool_input: {
          base: "main",
          head: "feat/x",
          title: "t",
          body: "b",
        },
      }),
      "tool-use",
      noopOptions,
    );
    const deny = getPreToolUseDeny(result);
    expect(deny?.reason).toMatch(/protected branch "main"/);
    expect(deny?.reason).toMatch(/human approval/i);
  });

  it("denies a PR targeting master", async () => {
    const result = await hook(
      preToolUseInput({
        tool_name: DevToolsGithubStubTools.create_pull_request,
        tool_input: {
          base: "master",
          head: "feat/y",
          title: "t",
          body: "b",
        },
      }),
      "tool-use",
      noopOptions,
    );
    expect(getPreToolUseDeny(result)?.reason).toMatch(/master/);
  });

  it("denies a PR targeting a release/* branch (regex default)", async () => {
    const result = await hook(
      preToolUseInput({
        tool_name: DevToolsGithubStubTools.create_pull_request,
        tool_input: {
          base: "release/2.1",
          head: "hotfix/abc",
          title: "t",
          body: "b",
        },
      }),
      "tool-use",
      noopOptions,
    );
    expect(getPreToolUseDeny(result)?.reason).toMatch(/release\/2\.1/);
  });

  it("passes through when the base field is missing (no crash)", async () => {
    const result = await hook(
      preToolUseInput({
        tool_name: DevToolsGithubStubTools.create_pull_request,
        tool_input: {
          head: "feat/x",
          title: "t",
          body: "b",
        },
      }),
      "tool-use",
      noopOptions,
    );
    expect(result).toEqual({ continue: true });
  });

  it("falls back to base_branch when base is absent", async () => {
    const result = await hook(
      preToolUseInput({
        tool_name: DevToolsGithubStubTools.create_pull_request,
        tool_input: {
          base_branch: "main",
          head: "feat/x",
          title: "t",
          body: "b",
        },
      }),
      "tool-use",
      noopOptions,
    );
    expect(getPreToolUseDeny(result)?.reason).toMatch(/main/);
  });

  it("passes through when tool_name does not match (defense in depth)", async () => {
    const result = await hook(
      preToolUseInput({
        tool_name: "Some.Other.Tool",
        tool_input: { base: "main" },
      }),
      "tool-use",
      noopOptions,
    );
    expect(result).toEqual({ continue: true });
  });

  it("ignores non-PreToolUse events", async () => {
    const stopInput: HookInput = {
      ...baseFields,
      hook_event_name: "Stop",
      stop_hook_active: false,
    };
    const result = await hook(stopInput, undefined, noopOptions);
    expect(result).toEqual({ continue: true });
  });

  it("respects an allowedBranches override that replaces the defaults", async () => {
    const customMatcher = protectedBranchGate({
      allowedBranches: ["production", "staging"],
    });
    const [customHook] = customMatcher.hooks;
    if (customHook === undefined) throw new Error("missing hook");

    // main is no longer protected under the custom config — replaces defaults.
    const allowed = await customHook(
      preToolUseInput({
        tool_name: DevToolsGithubStubTools.create_pull_request,
        tool_input: {
          base: "main",
          head: "feat/x",
          title: "t",
          body: "b",
        },
      }),
      "tool-use",
      noopOptions,
    );
    expect(allowed).toEqual({ continue: true });

    // production IS protected under the custom config.
    const denied = await customHook(
      preToolUseInput({
        tool_name: DevToolsGithubStubTools.create_pull_request,
        tool_input: {
          base: "production",
          head: "hotfix/x",
          title: "t",
          body: "b",
        },
      }),
      "tool-use",
      noopOptions,
    );
    expect(getPreToolUseDeny(denied)?.reason).toMatch(/production/);
  });
});

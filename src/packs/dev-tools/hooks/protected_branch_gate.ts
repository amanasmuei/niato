import {
  type HookCallback,
  type HookCallbackMatcher,
} from "@anthropic-ai/claude-agent-sdk";
import { DevToolsGithubStubTools } from "../tools/dev_tools_github_stub.js";

// Pack-scoped PreToolUse hook factory. Scoped to the create_pull_request tool
// via the matcher field — same shape as support's dollarLimit. Denies PRs
// targeting protected branches with a reason that surfaces back to the
// orchestrator, which can then replan (escalate, ask a clarifier, etc.).
//
// Defaults: literal "main", literal "master", regex /^release\//.
// Caller can override via `allowedBranches: string[]` (those replace the
// defaults entirely; strings are matched by exact equality).
//
// "allowedBranches" reads inverted from what it gates — it's the list of
// PROTECTED targets a PR is NOT allowed to open against. Naming kept to
// match the architecture spec.

export interface ProtectedBranchGateOptions {
  // Override the default protected-branch list. Strings are matched by exact
  // equality; regexes match against the full base value. When provided, this
  // replaces the defaults entirely.
  allowedBranches?: readonly string[];
  // Field name on `tool_input` carrying the target branch. Tries `base` first
  // then `base_branch` for Linear/alternate-payload compatibility.
  baseField?: string;
}

const DEFAULT_PROTECTED: readonly (string | RegExp)[] = [
  "main",
  "master",
  /^release\//,
];

function readBase(toolInput: unknown, fields: readonly string[]): string | null {
  if (typeof toolInput !== "object" || toolInput === null) return null;
  // shape-narrowing cast — tool_input is structurally unknown at the SDK boundary
  const obj = toolInput as Record<string, unknown>;
  for (const field of fields) {
    const value = obj[field];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function isProtected(
  base: string,
  patterns: readonly (string | RegExp)[],
): boolean {
  for (const p of patterns) {
    if (typeof p === "string") {
      if (base === p) return true;
    } else if (p.test(base)) {
      return true;
    }
  }
  return false;
}

function describePatterns(patterns: readonly (string | RegExp)[]): string {
  return patterns
    .map((p) => (typeof p === "string" ? p : p.toString()))
    .join(", ");
}

export function protectedBranchGate(
  options: ProtectedBranchGateOptions = {},
): HookCallbackMatcher {
  const toolName = DevToolsGithubStubTools.create_pull_request;
  const patterns: readonly (string | RegExp)[] =
    options.allowedBranches ?? DEFAULT_PROTECTED;
  const baseFields: readonly string[] =
    options.baseField !== undefined
      ? [options.baseField]
      : ["base", "base_branch"];

  const callback: HookCallback = (input) => {
    if (input.hook_event_name !== "PreToolUse") {
      return Promise.resolve({ continue: true });
    }
    // Defense in depth: matcher already scopes us to the PR tool.
    if (input.tool_name !== toolName) {
      return Promise.resolve({ continue: true });
    }
    const base = readBase(input.tool_input, baseFields);
    if (base === null) {
      // No base field => can't gate. Pass through; the model's own zod schema
      // for the tool will reject a malformed call.
      return Promise.resolve({ continue: true });
    }
    if (isProtected(base, patterns)) {
      return Promise.resolve({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `Pull request to protected branch "${base}" requires human approval (protected: ${describePatterns(patterns)}). Forward to a human reviewer or open the PR against an unprotected branch first.`,
        },
      });
    }
    return Promise.resolve({ continue: true });
  };
  return { matcher: toolName, hooks: [callback] };
}

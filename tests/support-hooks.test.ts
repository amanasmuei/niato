import { describe, it, expect } from "vitest";
import {
  type HookInput,
  type HookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";
import {
  piiRedactionHook,
  findCreditCard,
  findSsn,
} from "../src/packs/support/hooks/pii_redaction.js";
import { dollarLimit } from "../src/packs/support/hooks/dollar_limit.js";
import { SupportStubTools } from "../src/packs/support/tools/support_stub.js";

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

// ---------- PII detection helpers ----------

describe("findCreditCard", () => {
  it("matches a Luhn-valid 16-digit card with no separators", () => {
    // 4111 1111 1111 1111 is the canonical Visa test number (Luhn-valid)
    expect(findCreditCard("note: 4111111111111111 in body")).toBe(
      "4111111111111111",
    );
  });

  it("matches a Luhn-valid card with spaces", () => {
    expect(findCreditCard("card 4111 1111 1111 1111")).toBe(
      "4111 1111 1111 1111",
    );
  });

  it("ignores random 16-digit numbers that fail Luhn", () => {
    // 1234567890123456 is not Luhn-valid
    expect(findCreditCard("order 1234567890123456")).toBeNull();
  });

  it("ignores short numeric strings (order IDs)", () => {
    expect(findCreditCard("order ORD-12345")).toBeNull();
    expect(findCreditCard("ticket 12345")).toBeNull();
  });
});

describe("findSsn", () => {
  it("matches an SSN-shaped string", () => {
    expect(findSsn("my ssn is 123-45-6789 ok")).toBe("123-45-6789");
  });

  it("ignores phone numbers and other dashed sequences", () => {
    expect(findSsn("call 555-1234")).toBeNull();
    expect(findSsn("zip code 90210")).toBeNull();
  });
});

// ---------- piiRedactionHook ----------

describe("piiRedactionHook", () => {
  it("denies a tool call whose input contains a Luhn-valid credit card", async () => {
    const result = await piiRedactionHook(
      preToolUseInput({
        tool_name: SupportStubTools.issue_refund,
        tool_input: {
          order_id: "ORD-12345",
          amount_usd: 15,
          reason: "card was 4111111111111111",
        },
      }),
      "tool-use-1",
      noopOptions,
    );
    const deny = getPreToolUseDeny(result);
    expect(deny).toBeDefined();
    expect(deny?.reason).toMatch(/credit card/i);
  });

  it("denies a tool call whose input contains an SSN", async () => {
    const result = await piiRedactionHook(
      preToolUseInput({
        tool_name: SupportStubTools.lookup_ticket,
        tool_input: { ticket_id: "TKT-123 ssn: 123-45-6789" },
      }),
      "tool-use-2",
      noopOptions,
    );
    expect(getPreToolUseDeny(result)?.reason).toMatch(/SSN/i);
  });

  it("allows a benign tool call", async () => {
    const result = await piiRedactionHook(
      preToolUseInput({
        tool_name: SupportStubTools.lookup_ticket,
        tool_input: { ticket_id: "TKT-12345" },
      }),
      "tool-use-3",
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
    const result = await piiRedactionHook(stopInput, undefined, noopOptions);
    expect(result).toEqual({ continue: true });
  });
});

// ---------- dollarLimit ----------

describe("dollarLimit factory", () => {
  const matcher = dollarLimit({
    tool: SupportStubTools.issue_refund,
    autoApproveBelow: 20,
  });
  const [hook] = matcher.hooks;
  if (hook === undefined) throw new Error("dollarLimit returned no hook");

  it("matcher field equals the gated tool name", () => {
    expect(matcher.matcher).toBe("mcp__support_stub__issue_refund");
  });

  it("allows a refund strictly below the threshold", async () => {
    const result = await hook(
      preToolUseInput({
        tool_name: SupportStubTools.issue_refund,
        tool_input: { order_id: "ORD-1", amount_usd: 19.99, reason: "x" },
      }),
      "tool-use-1",
      noopOptions,
    );
    expect(result).toEqual({ continue: true });
  });

  it("denies a refund exactly at the threshold (>=, not >)", async () => {
    const result = await hook(
      preToolUseInput({
        tool_name: SupportStubTools.issue_refund,
        tool_input: { order_id: "ORD-1", amount_usd: 20, reason: "x" },
      }),
      "tool-use-2",
      noopOptions,
    );
    expect(getPreToolUseDeny(result)?.reason).toMatch(/human approval/i);
  });

  it("denies a refund above the threshold", async () => {
    const result = await hook(
      preToolUseInput({
        tool_name: SupportStubTools.issue_refund,
        tool_input: { order_id: "ORD-1", amount_usd: 250, reason: "x" },
      }),
      "tool-use-3",
      noopOptions,
    );
    const deny = getPreToolUseDeny(result);
    expect(deny?.reason).toContain("$250.00");
    expect(deny?.reason).toContain("$20.00");
  });

  it("passes through when the amount field is missing", async () => {
    const result = await hook(
      preToolUseInput({
        tool_name: SupportStubTools.issue_refund,
        tool_input: { order_id: "ORD-1", reason: "x" },
      }),
      "tool-use-4",
      noopOptions,
    );
    expect(result).toEqual({ continue: true });
  });

  it("passes through when the tool_name does not match (defense in depth)", async () => {
    // This should never happen if the matcher is honored, but the callback
    // double-checks. Test that double-check.
    const result = await hook(
      preToolUseInput({
        tool_name: "Some.Other.Tool",
        tool_input: { amount_usd: 9999 },
      }),
      "tool-use-5",
      noopOptions,
    );
    expect(result).toEqual({ continue: true });
  });

  it("respects a custom amount field", async () => {
    const customMatcher = dollarLimit({
      tool: "some_tool",
      autoApproveBelow: 100,
      amountField: "total_cents",
    });
    const [customHook] = customMatcher.hooks;
    if (customHook === undefined) throw new Error("missing hook");
    const result = await customHook(
      preToolUseInput({
        tool_name: "some_tool",
        tool_input: { total_cents: 150 },
      }),
      "tool-use-6",
      noopOptions,
    );
    expect(getPreToolUseDeny(result)).toBeDefined();
  });
});

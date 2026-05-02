import { describe, it, expect } from "vitest";
import { dollarLimit } from "../src/packs/support/hooks/dollar_limit.js";

describe("dollarLimit (ask mode)", () => {
  it("returns permissionDecision: 'ask' for amounts at or above threshold", async () => {
    const matcher = dollarLimit({
      tool: "mcp__support__issue_refund",
      autoApproveBelow: 500,
    });
    const callback = matcher.hooks[0];
    if (callback === undefined) {
      throw new Error("dollarLimit returned a matcher with no hooks");
    }
    const result = await callback(
      // Cast: the SDK's PreToolUseHookInput has additional fields not
      // exercised by this hook; we provide only what dollar_limit reads.
      {
        hook_event_name: "PreToolUse",
        tool_name: "mcp__support__issue_refund",
        tool_input: { amount_usd: 600 },
      } as unknown as Parameters<typeof callback>[0],
      // Cast: tool runtime context not exercised by this hook.
      {} as unknown as Parameters<typeof callback>[1],
      // Cast: signal context not exercised either.
      {} as unknown as Parameters<typeof callback>[2],
    );
    // Cast: hookSpecificOutput is a discriminated union; PreToolUse branch
    // is the only one this hook returns.
    const out = (result as {
      hookSpecificOutput: {
        permissionDecision: string;
        permissionDecisionReason: string;
      };
    }).hookSpecificOutput;
    expect(out.permissionDecision).toBe("ask");
    expect(out.permissionDecisionReason).toContain("exceeds");
    expect(out.permissionDecisionReason).toContain("$500.00");
    expect(out.permissionDecisionReason).toContain("$600.00");
  });

  it("returns continue: true for amounts below threshold", async () => {
    const matcher = dollarLimit({
      tool: "mcp__support__issue_refund",
      autoApproveBelow: 500,
    });
    const callback = matcher.hooks[0];
    if (callback === undefined) {
      throw new Error("dollarLimit returned a matcher with no hooks");
    }
    const result = await callback(
      {
        hook_event_name: "PreToolUse",
        tool_name: "mcp__support__issue_refund",
        tool_input: { amount_usd: 100 },
      } as unknown as Parameters<typeof callback>[0],
      {} as unknown as Parameters<typeof callback>[1],
      {} as unknown as Parameters<typeof callback>[2],
    );
    expect(result).toEqual({ continue: true });
  });
});

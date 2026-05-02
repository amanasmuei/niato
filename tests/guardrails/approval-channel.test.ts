import { describe, it, expect } from "vitest";
import { createApprovalChannel } from "../../src/guardrails/approval-channel.js";

describe("ApprovalChannel", () => {
  it("resolves request() when resolve() is called with the matching id", async () => {
    const ch = createApprovalChannel();
    const reqPromise = ch.request(
      {
        approvalId: "tu_1",
        toolName: "mcp__billing__refund",
        toolInput: { amount_usd: 600 },
        reason: "over $500 limit",
      },
      new AbortController().signal,
    );
    ch.resolve("tu_1", { decision: "allow", reason: undefined });
    const result = await reqPromise;
    expect(result).toEqual({ decision: "allow", reason: undefined });
  });

  it("subscribers see incoming requests in arrival order", () => {
    const ch = createApprovalChannel();
    const seen: string[] = [];
    const unsub = ch.subscribe((req) => {
      seen.push(req.approvalId);
    });
    void ch.request(
      {
        approvalId: "a",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      new AbortController().signal,
    );
    void ch.request(
      {
        approvalId: "b",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      new AbortController().signal,
    );
    unsub();
    expect(seen).toEqual(["a", "b"]);
  });

  it("rejects request() with AbortError when signal aborts before resolve", async () => {
    const ch = createApprovalChannel();
    const ctrl = new AbortController();
    const reqPromise = ch.request(
      {
        approvalId: "tu_2",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      ctrl.signal,
    );
    ctrl.abort();
    await expect(reqPromise).rejects.toThrow(/abort/i);
  });

  it("ignores resolve() calls for unknown ids", () => {
    const ch = createApprovalChannel();
    expect(() => {
      ch.resolve("never-issued", { decision: "allow", reason: undefined });
    }).not.toThrow();
  });
});

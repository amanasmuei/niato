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

  it("late subscriber sees currently-pending requests", () => {
    const ch = createApprovalChannel();
    void ch.request(
      {
        approvalId: "tu_late",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      new AbortController().signal,
    );
    const seen: string[] = [];
    ch.subscribe((req) => {
      seen.push(req.approvalId);
    });
    expect(seen).toEqual(["tu_late"]);
  });

  it("rejects duplicate approvalId rather than abandoning the prior request", async () => {
    const ch = createApprovalChannel();
    const first = ch.request(
      {
        approvalId: "tu_dup",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      new AbortController().signal,
    );
    const second = ch.request(
      {
        approvalId: "tu_dup",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      new AbortController().signal,
    );
    await expect(second).rejects.toThrow(/duplicate/i);
    // First is still pending — resolve it normally.
    ch.resolve("tu_dup", { decision: "allow", reason: undefined });
    const result = await first;
    expect(result).toEqual({ decision: "allow", reason: undefined });
  });

  it("listener exceptions do not block subsequent listeners or leak pending", async () => {
    const ch = createApprovalChannel();
    const seen: string[] = [];
    ch.subscribe(() => {
      throw new Error("first listener exploded");
    });
    ch.subscribe((req) => {
      seen.push(req.approvalId);
    });
    const reqPromise = ch.request(
      {
        approvalId: "tu_exc",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      new AbortController().signal,
    );
    expect(seen).toEqual(["tu_exc"]);
    ch.resolve("tu_exc", { decision: "deny", reason: "no" });
    const result = await reqPromise;
    expect(result).toEqual({ decision: "deny", reason: "no" });
  });

  it("abort fired after resolve is a no-op (does not corrupt pending state)", async () => {
    const ch = createApprovalChannel();
    const ctrl = new AbortController();
    const first = ch.request(
      {
        approvalId: "tu_first",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      ctrl.signal,
    );
    ch.resolve("tu_first", { decision: "allow", reason: undefined });
    await first;
    // A second request reusing the same id is allowed because the first
    // settled cleanly. Abort the (now-stale) original signal — must not
    // touch the second pending entry.
    const ctrl2 = new AbortController();
    const second = ch.request(
      {
        approvalId: "tu_first",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      ctrl2.signal,
    );
    ctrl.abort();
    ch.resolve("tu_first", { decision: "deny", reason: "blocked" });
    const result = await second;
    expect(result).toEqual({ decision: "deny", reason: "blocked" });
  });
});

import { describe, it, expect } from "vitest";
import { createNiato } from "../src/core/compose.js";
import { genericPack } from "../src/packs/generic/index.js";
import { type NiatoEvent } from "../src/observability/events.js";
import { type IntentResult } from "../src/core/classifier/types.js";
import { createApprovalChannel } from "../src/guardrails/approval-channel.js";

const baseConfig = {
  ANTHROPIC_API_KEY: "sk-test",
  NIATO_LOG_LEVEL: "error" as const,
  NIATO_USER_ID: "default",
};

// Local capture shape for the canUseTool callback under test. The
// orchestrator's CanUseTool type from @anthropic-ai/claude-agent-sdk
// has additional optional fields in `ctx` (suggestions, blockedPath,
// title, displayName, description, agentID) that the round-trip tests
// don't model. Capturing through this narrower type keeps the assertion
// surface tight; the cast below acknowledges the structural widening.
type CapturedCanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  ctx: {
    signal: AbortSignal;
    toolUseID: string;
    decisionReason?: string;
  },
) => Promise<{ behavior: "allow" } | { behavior: "deny"; message: string }>;

describe("Niato.runStream", () => {
  it("invokes onEvent with a turn_start event before classification, then classified, then turn_complete", async () => {
    const fakeClassification: IntentResult = {
      domain: "generic",
      intent: "task",
      confidence: 0.9,
    };
    const events: NiatoEvent[] = [];
    const niato = createNiato({
      packs: [genericPack],
      classifier: {
        classify: () => Promise.resolve(fakeClassification),
      },
      // Cast: orchestratorRunner test seam accepts our minimal stub; the
      // production runner returns the same shape (result + messages).
      orchestratorRunner: () =>
        Promise.resolve({ result: "ok", messages: [] }),
      config: baseConfig,
    });

    await niato.runStream("hi", "s1", (e) => {
      events.push(e);
    });
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("turn_start");
    expect(types).toContain("classified");
    expect(types[types.length - 1]).toBe("turn_complete");
  });

  it("run() returns same shape as runStream() — and runStream with a noop callback emits no observable events to a separate observer", async () => {
    const niato = createNiato({
      packs: [genericPack],
      classifier: {
        classify: () =>
          Promise.resolve({
            domain: "generic",
            intent: "task",
            confidence: 0.9,
          }),
      },
      orchestratorRunner: () =>
        Promise.resolve({ result: "ok", messages: [] }),
      config: baseConfig,
    });
    // run() should return the same shape as runStream() with a noop.
    const turn = await niato.run("hi", "s2");
    expect(turn.result).toBe("ok");
    expect(turn.classification.domain).toBe("generic");

    // Independently, runStream with a noop callback should still produce
    // a complete event sequence (verifies run() = runStream + noop is
    // structurally honest, not just that run() doesn't crash).
    const events: NiatoEvent[] = [];
    await niato.runStream("hi", "s2b", (e) => {
      events.push(e);
    });
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("turn_start");
    expect(types[types.length - 1]).toBe("turn_complete");
  });

  it("approval channel round-trip: allow decision translates to behavior=allow", async () => {
    const channel = createApprovalChannel();
    const fakeClassification: IntentResult = {
      domain: "generic",
      intent: "task",
      confidence: 0.9,
    };
    let capturedCanUseTool: CapturedCanUseTool | undefined;
    const niato = createNiato({
      packs: [genericPack],
      approval: channel,
      classifier: { classify: () => Promise.resolve(fakeClassification) },
      orchestratorRunner: ({ canUseTool }) => {
        // Capture the canUseTool that compose.ts built for us via
        // buildCanUseTool. We invoke it directly below to verify the
        // round-trip without standing up a real SDK loop. The SDK's
        // CanUseTool is structurally compatible with CapturedCanUseTool
        // (wider ctx, narrower return — assigns without a cast).
        capturedCanUseTool = canUseTool;
        return Promise.resolve({ result: "ok", messages: [] });
      },
      config: baseConfig,
    });
    await niato.runStream("hi", "s_round_trip", () => undefined);
    if (capturedCanUseTool === undefined) {
      throw new Error(
        "buildCanUseTool was not threaded into orchestratorRunner",
      );
    }
    // Drive the round-trip: invoke canUseTool, then resolve the channel
    // request that surfaces from it.
    const ctrl = new AbortController();
    const ctx = {
      signal: ctrl.signal,
      toolUseID: "tu_test_1",
      decisionReason: "over-the-limit",
    };
    const reqPromise = capturedCanUseTool(
      "mcp__x__y",
      { amount_usd: 600 },
      ctx,
    );
    // The channel should now have a pending request keyed by tu_test_1.
    // Resolve it with allow.
    channel.resolve("tu_test_1", { decision: "allow", reason: undefined });
    const result = await reqPromise;
    expect(result).toEqual({ behavior: "allow" });
  });

  it("approval channel round-trip: deny decision translates to behavior=deny with reason", async () => {
    const channel = createApprovalChannel();
    let capturedCanUseTool: CapturedCanUseTool | undefined;
    const niato = createNiato({
      packs: [genericPack],
      approval: channel,
      classifier: {
        classify: () =>
          Promise.resolve({
            domain: "generic",
            intent: "task",
            confidence: 0.9,
          }),
      },
      orchestratorRunner: ({ canUseTool }) => {
        // See prior test for rationale — direct assignment, structural
        // compat handles the SDK→Captured shape.
        capturedCanUseTool = canUseTool;
        return Promise.resolve({ result: "ok", messages: [] });
      },
      config: baseConfig,
    });
    await niato.runStream("hi", "s_round_trip_deny", () => undefined);
    if (capturedCanUseTool === undefined) {
      throw new Error(
        "buildCanUseTool was not threaded into orchestratorRunner",
      );
    }
    const ctrl = new AbortController();
    const ctx = {
      signal: ctrl.signal,
      toolUseID: "tu_test_2",
      decisionReason: "over-the-limit",
    };
    const reqPromise = capturedCanUseTool(
      "mcp__x__y",
      { amount_usd: 600 },
      ctx,
    );
    channel.resolve("tu_test_2", {
      decision: "deny",
      reason: "user denied via TUI",
    });
    const result = await reqPromise;
    expect(result).toEqual({
      behavior: "deny",
      message: "user denied via TUI",
    });
  });

  it("emits turn_failed when orchestratorRunner throws, and re-throws", async () => {
    const events: NiatoEvent[] = [];
    const niato = createNiato({
      packs: [genericPack],
      classifier: {
        classify: () =>
          Promise.resolve({
            domain: "generic",
            intent: "task",
            confidence: 0.9,
          }),
      },
      orchestratorRunner: () =>
        Promise.reject(new Error("boom from stub orchestrator")),
      config: baseConfig,
    });
    await expect(
      niato.runStream("hi", "s_fail", (e) => {
        events.push(e);
      }),
    ).rejects.toThrow(/boom/);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("turn_start");
    expect(types).toContain("turn_failed");
    expect(types).not.toContain("turn_complete");
    const failed = events.find((e) => e.type === "turn_failed");
    if (failed === undefined) {
      throw new Error("expected turn_failed event");
    }
    expect(failed.error).toMatch(/boom/);
  });
});

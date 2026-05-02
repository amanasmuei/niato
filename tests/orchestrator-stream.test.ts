import { describe, it, expect, vi } from "vitest";
import { type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  buildOrchestratorOptions,
  runOrchestrator,
} from "../src/core/orchestrator/orchestrator.js";
import { genericPack } from "../src/packs/generic/index.js";
import { type NiatoEvent } from "../src/observability/events.js";

// We don't run a real SDK in this test — we'd need a network call. Instead
// we verify the wiring: runOrchestrator's onEvent callback is invoked for
// each translated SDKMessage, and canUseTool is plumbed into Options.

describe("runOrchestrator event streaming", () => {
  it("buildOrchestratorOptions threads canUseTool when provided", () => {
    const canUseTool = vi.fn();
    const options = buildOrchestratorOptions({
      userInput: "x",
      classification: { domain: "generic", intent: "task", confidence: 0.9 },
      packs: [genericPack],
      canUseTool,
    });
    expect(options.canUseTool).toBe(canUseTool);
  });

  it("buildOrchestratorOptions omits canUseTool when undefined", () => {
    const options = buildOrchestratorOptions({
      userInput: "x",
      classification: { domain: "generic", intent: "task", confidence: 0.9 },
      packs: [genericPack],
    });
    expect(options.canUseTool).toBeUndefined();
  });
});

// Streaming-event verification uses an injected query() stub. The real
// `query` is hard to stub without a wrapper, so this task adds a tiny
// dependency-injection seam: runOrchestrator accepts an optional
// `queryImpl` field on input, defaulting to the SDK's query.
describe("runOrchestrator event streaming with stub query", () => {
  it("emits specialist_dispatched per orchestrator Agent dispatch", async () => {
    const stubMessages: SDKMessage[] = [
      {
        type: "assistant",
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: "tool_use",
              id: "tu_1",
              name: "Agent",
              input: { subagent_type: "generic.action", prompt: "do" },
            },
          ],
        },
      } as unknown as SDKMessage,
      {
        type: "result",
        subtype: "success",
        result: "done",
        modelUsage: {},
        total_cost_usd: 0,
        permission_denials: [],
      } as unknown as SDKMessage,
    ];

    async function* stubQuery(): AsyncIterable<SDKMessage> {
      // Yield to the microtask queue so this is genuinely async — keeps
      // the eslint require-await rule honest and matches how the real
      // SDK's query() interleaves work between messages.
      await Promise.resolve();
      for (const m of stubMessages) yield m;
    }

    const events: NiatoEvent[] = [];
    await runOrchestrator({
      userInput: "x",
      classification: { domain: "generic", intent: "task", confidence: 0.9 },
      packs: [genericPack],
      onEvent: (e) => {
        events.push(e);
      },
      queryImpl: () => stubQuery(),
    });

    expect(events).toEqual([
      {
        type: "specialist_dispatched",
        toolUseId: "tu_1",
        specialist: "generic.action",
      },
    ]);
  });
});

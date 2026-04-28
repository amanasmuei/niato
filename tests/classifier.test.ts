import { vi, describe, it, expect, beforeEach } from "vitest";
import type * as ClaudeAgentSdk from "@anthropic-ai/claude-agent-sdk";

// Phase 9: classifier moved off raw `@anthropic-ai/sdk` (API-key-only)
// onto `@anthropic-ai/claude-agent-sdk` (OAuth-capable). Tests mock
// `query()` instead of `messages.parse()`.

const mockQuery = vi.fn();

// Partial mock — only `query()` is replaced. Other exports (`tool`,
// `createSdkMcpServer`, type re-exports) flow through unchanged so
// pack code that imports them at module-init time continues to work.
vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof ClaudeAgentSdk>();
  return {
    ...actual,
    query: mockQuery,
  };
});

const { createSonnetClassifier } = await import(
  "../src/core/classifier/sonnet.js"
);
const { genericPack } = await import("../src/index.js");

interface MockResultMessage {
  type: "result";
  subtype: "success";
  structured_output?: unknown;
}

function asyncIterableOf(messages: MockResultMessage[]): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next() {
          if (i < messages.length) {
            return Promise.resolve({ value: messages[i++], done: false });
          }
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe("createSonnetClassifier", () => {
  it("rejects empty pack list", () => {
    expect(() => createSonnetClassifier({ packs: [] })).toThrow(
      /at least one DomainPack/,
    );
  });

  it("calls query() with the right model, prompt, and outputFormat schema", async () => {
    mockQuery.mockReturnValue(
      asyncIterableOf([
        {
          type: "result",
          subtype: "success",
          structured_output: {
            intent: "question",
            domain: "generic",
            confidence: 0.95,
          },
        },
      ]),
    );

    const classifier = createSonnetClassifier({ packs: [genericPack] });
    await classifier.classify("what is 2+2");

    expect(mockQuery).toHaveBeenCalledOnce();
    const args = mockQuery.mock.calls[0]?.[0] as {
      prompt: string;
      options: {
        model: string;
        systemPrompt: string;
        maxTurns: number;
        outputFormat: { type: string; schema: Record<string, unknown> };
      };
    };

    expect(args.prompt).toBe("what is 2+2");
    expect(args.options.model).toBe("claude-sonnet-4-6");
    expect(args.options.maxTurns).toBe(1);
    expect(args.options.outputFormat.type).toBe("json_schema");
    expect(args.options.outputFormat.schema["type"]).toBe("object");
    // Pack vocabulary stays in the system prompt — auth-mode-agnostic.
    expect(args.options.systemPrompt).toContain("generic");
    expect(args.options.systemPrompt).toContain("question");
    expect(args.options.systemPrompt).toContain("task");
    expect(args.options.systemPrompt).toContain("escalate");
  });

  it("returns the parsed IntentResult on success", async () => {
    mockQuery.mockReturnValue(
      asyncIterableOf([
        {
          type: "result",
          subtype: "success",
          structured_output: {
            intent: "task",
            domain: "generic",
            confidence: 0.92,
            urgency: "high",
          },
        },
      ]),
    );

    const classifier = createSonnetClassifier({ packs: [genericPack] });
    const result = await classifier.classify("create a file");

    expect(result).toEqual({
      intent: "task",
      domain: "generic",
      confidence: 0.92,
      urgency: "high",
    });
  });

  it("propagates the secondary multi-domain field through the schema", async () => {
    mockQuery.mockReturnValue(
      asyncIterableOf([
        {
          type: "result",
          subtype: "success",
          structured_output: {
            intent: "fix_bug",
            domain: "dev_tools",
            confidence: 0.93,
            secondary: [
              {
                intent: "complaint",
                domain: "support",
                confidence: 0.88,
              },
            ],
          },
        },
      ]),
    );

    const classifier = createSonnetClassifier({ packs: [genericPack] });
    const result = await classifier.classify(
      "the refund webhook is broken — find the bug and open a ticket",
    );

    expect(result.intent).toBe("fix_bug");
    expect(result.secondary).toEqual([
      { intent: "complaint", domain: "support", confidence: 0.88 },
    ]);
  });

  it("throws when no result message has structured_output", async () => {
    mockQuery.mockReturnValue(asyncIterableOf([]));
    const classifier = createSonnetClassifier({ packs: [genericPack] });
    await expect(classifier.classify("anything")).rejects.toThrow(
      /did not return a structured_output/,
    );
  });

  it("throws when the structured output fails IntentResultSchema (invalid confidence)", async () => {
    mockQuery.mockReturnValue(
      asyncIterableOf([
        {
          type: "result",
          subtype: "success",
          structured_output: {
            intent: "question",
            domain: "generic",
            confidence: 1.5, // > 1, invalid
          },
        },
      ]),
    );
    const classifier = createSonnetClassifier({ packs: [genericPack] });
    await expect(classifier.classify("anything")).rejects.toThrow();
  });

  it("validates secondary entries against the schema (rejects invalid confidence)", async () => {
    mockQuery.mockReturnValue(
      asyncIterableOf([
        {
          type: "result",
          subtype: "success",
          structured_output: {
            intent: "fix_bug",
            domain: "dev_tools",
            confidence: 0.9,
            secondary: [
              { intent: "complaint", domain: "support", confidence: 2 },
            ],
          },
        },
      ]),
    );
    const classifier = createSonnetClassifier({ packs: [genericPack] });
    await expect(classifier.classify("anything")).rejects.toThrow();
  });

  it("uses a custom model when provided", async () => {
    mockQuery.mockReturnValue(
      asyncIterableOf([
        {
          type: "result",
          subtype: "success",
          structured_output: {
            intent: "question",
            domain: "generic",
            confidence: 0.95,
          },
        },
      ]),
    );

    const classifier = createSonnetClassifier({
      packs: [genericPack],
      model: "claude-haiku-4-5",
    });
    await classifier.classify("hi");

    const args = mockQuery.mock.calls[0]?.[0] as {
      options: { model: string };
    };
    expect(args.options.model).toBe("claude-haiku-4-5");
  });
});

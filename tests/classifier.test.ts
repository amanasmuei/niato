import { vi, describe, it, expect, beforeEach } from "vitest";

const mockParse = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = { parse: mockParse };
  }
  return { default: Anthropic };
});

const { createHaikuClassifier } = await import(
  "../src/core/classifier/haiku.js"
);
const { genericPack } = await import("../src/index.js");

beforeEach(() => {
  mockParse.mockReset();
});

describe("createHaikuClassifier", () => {
  it("rejects empty pack list", () => {
    expect(() =>
      createHaikuClassifier({ packs: [], apiKey: "test" }),
    ).toThrow(/at least one DomainPack/);
  });

  it("calls messages.parse with cache_control on the system prompt", async () => {
    mockParse.mockResolvedValue({
      parsed_output: {
        intent: "question",
        domain: "generic",
        confidence: 0.95,
      },
    });

    const classifier = createHaikuClassifier({
      packs: [genericPack],
      apiKey: "test-key",
    });
    await classifier.classify("what is 2+2");

    expect(mockParse).toHaveBeenCalledOnce();
    const args = mockParse.mock.calls[0]?.[0] as {
      model: string;
      system: { type: string; text: string; cache_control?: { type: string } }[];
      output_config: { format: unknown };
      messages: { role: string; content: string }[];
    };

    expect(args.model).toBe("claude-haiku-4-5");
    expect(args.system).toHaveLength(1);
    expect(args.system[0]?.type).toBe("text");
    expect(args.system[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(args.output_config.format).toBeDefined();
    expect(args.messages).toEqual([
      { role: "user", content: "what is 2+2" },
    ]);
  });

  it("includes the pack vocabulary in the system prompt", async () => {
    mockParse.mockResolvedValue({
      parsed_output: {
        intent: "question",
        domain: "generic",
        confidence: 0.95,
      },
    });

    const classifier = createHaikuClassifier({
      packs: [genericPack],
      apiKey: "test-key",
    });
    await classifier.classify("anything");

    const args = mockParse.mock.calls[0]?.[0] as {
      system: { text: string }[];
    };
    const systemText = args.system[0]?.text ?? "";
    expect(systemText).toContain("generic");
    expect(systemText).toContain("question");
    expect(systemText).toContain("task");
    expect(systemText).toContain("escalate");
  });

  it("returns the parsed IntentResult on success", async () => {
    mockParse.mockResolvedValue({
      parsed_output: {
        intent: "task",
        domain: "generic",
        confidence: 0.92,
        urgency: "high",
      },
    });

    const classifier = createHaikuClassifier({
      packs: [genericPack],
      apiKey: "test-key",
    });
    const result = await classifier.classify("create a file");

    expect(result).toEqual({
      intent: "task",
      domain: "generic",
      confidence: 0.92,
      urgency: "high",
    });
  });

  it("throws when parsed_output is null", async () => {
    mockParse.mockResolvedValue({ parsed_output: null });

    const classifier = createHaikuClassifier({
      packs: [genericPack],
      apiKey: "test-key",
    });
    await expect(classifier.classify("anything")).rejects.toThrow(
      /failed schema validation/,
    );
  });

  it("validates response against IntentResultSchema and throws on invalid confidence", async () => {
    mockParse.mockResolvedValue({
      parsed_output: {
        intent: "question",
        domain: "generic",
        confidence: 1.5, // invalid: must be ≤ 1
      },
    });

    const classifier = createHaikuClassifier({
      packs: [genericPack],
      apiKey: "test-key",
    });
    await expect(classifier.classify("anything")).rejects.toThrow();
  });

  it("propagates a multi-domain `secondary` field through the schema", async () => {
    mockParse.mockResolvedValue({
      parsed_output: {
        intent: "fix_bug",
        domain: "dev_tools",
        confidence: 0.93,
        secondary: [
          { intent: "complaint", domain: "support", confidence: 0.88 },
        ],
      },
    });

    const classifier = createHaikuClassifier({
      packs: [genericPack],
      apiKey: "test-key",
    });
    const result = await classifier.classify(
      "the refund webhook is broken — find the bug and open a ticket",
    );

    expect(result.intent).toBe("fix_bug");
    expect(result.domain).toBe("dev_tools");
    expect(result.secondary).toEqual([
      { intent: "complaint", domain: "support", confidence: 0.88 },
    ]);
  });

  it("validates secondary entries against the schema (rejects invalid confidence)", async () => {
    mockParse.mockResolvedValue({
      parsed_output: {
        intent: "fix_bug",
        domain: "dev_tools",
        confidence: 0.9,
        secondary: [{ intent: "complaint", domain: "support", confidence: 2 }],
      },
    });

    const classifier = createHaikuClassifier({
      packs: [genericPack],
      apiKey: "test-key",
    });
    await expect(classifier.classify("anything")).rejects.toThrow();
  });

  it("uses a custom model when provided", async () => {
    mockParse.mockResolvedValue({
      parsed_output: {
        intent: "question",
        domain: "generic",
        confidence: 0.95,
      },
    });

    const classifier = createHaikuClassifier({
      packs: [genericPack],
      apiKey: "test-key",
      model: "claude-haiku-4-5-20251001",
    });
    await classifier.classify("hi");

    const args = mockParse.mock.calls[0]?.[0] as { model: string };
    expect(args.model).toBe("claude-haiku-4-5-20251001");
  });
});

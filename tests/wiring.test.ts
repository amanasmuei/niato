import { describe, expect, it } from "vitest";
import {
  createNawaitu,
  genericPack,
  mergePackAgents,
  stubClassifier,
  type Config,
} from "../src/index.js";
import { loadConfig } from "../src/core/config.js";

const fakeConfig: Config = {
  ANTHROPIC_API_KEY: "test-key-not-real",
  NAWAITU_LOG_LEVEL: "error",
};

describe("createNawaitu", () => {
  it("exposes run()", () => {
    const nawaitu = createNawaitu({ packs: [genericPack], config: fakeConfig });
    expect(typeof nawaitu.run).toBe("function");
  });

  it("rejects an empty pack list", () => {
    expect(() =>
      createNawaitu({ packs: [], config: fakeConfig }),
    ).toThrow(/at least one DomainPack/);
  });
});

describe("mergePackAgents", () => {
  it("namespaces specialists as <pack>.<specialist>", () => {
    const merged = mergePackAgents([genericPack]);
    expect(Object.keys(merged).sort()).toEqual([
      "generic.action",
      "generic.escalate",
      "generic.retrieval",
    ]);
  });

  it("preserves each specialist's tool list", () => {
    const merged = mergePackAgents([genericPack]);
    expect(merged["generic.retrieval"]?.tools).toEqual([
      "Read",
      "Grep",
      "Glob",
      "WebSearch",
      "WebFetch",
    ]);
    expect(merged["generic.action"]?.tools).toEqual([
      "Read",
      "Write",
      "Edit",
      "Bash",
    ]);
    expect(merged["generic.escalate"]?.tools).toEqual([]);
  });
});

describe("stubClassifier", () => {
  it("returns the documented Phase 1 shape for any input", async () => {
    const result = await stubClassifier.classify("anything at all");
    expect(result).toEqual({
      intent: "question",
      domain: "generic",
      confidence: 0.95,
    });
  });
});

describe("genericPack.route", () => {
  it("maps question→retrieval, task→action, escalate→escalate", () => {
    expect(
      genericPack.route({
        intent: "question",
        domain: "generic",
        confidence: 1,
      }),
    ).toBe("retrieval");
    expect(
      genericPack.route({ intent: "task", domain: "generic", confidence: 1 }),
    ).toBe("action");
    expect(
      genericPack.route({
        intent: "escalate",
        domain: "generic",
        confidence: 1,
      }),
    ).toBe("escalate");
  });

  it("returns null for unknown intents", () => {
    expect(
      genericPack.route({
        intent: "unknown_intent",
        domain: "generic",
        confidence: 1,
      }),
    ).toBeNull();
  });
});

describe("loadConfig", () => {
  it("throws when ANTHROPIC_API_KEY is missing", () => {
    expect(() => loadConfig({})).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("succeeds with ANTHROPIC_API_KEY set", () => {
    const cfg = loadConfig({ ANTHROPIC_API_KEY: "sk-test" });
    expect(cfg.ANTHROPIC_API_KEY).toBe("sk-test");
    expect(cfg.NAWAITU_LOG_LEVEL).toBe("info");
  });
});

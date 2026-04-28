import { describe, expect, it } from "vitest";
import {
  createNawaitu,
  genericPack,
  mergeHooks,
  mergePackAgents,
  stubClassifier,
  NawaituBudgetExceededError,
  type Config,
  type Hooks,
  type SessionContext,
} from "../src/index.js";
import { loadConfig } from "../src/core/config.js";
import { ensureBudget } from "../src/core/compose.js";

const noopHook = () => Promise.resolve({ continue: true as const });

function fakeSession(cumulativeCostUsd: number): SessionContext {
  return {
    id: "test-session",
    createdAt: new Date(0),
    turnCount: 0,
    cumulativeCostUsd,
  };
}

const fakeConfig: Config = {
  ANTHROPIC_API_KEY: "test-key-not-real",
  NAWAITU_LOG_LEVEL: "error",
};

describe("createNawaitu", () => {
  it("exposes run()", () => {
    const nawaitu = createNawaitu({
      packs: [genericPack],
      classifier: stubClassifier,
      config: fakeConfig,
    });
    expect(typeof nawaitu.run).toBe("function");
  });

  it("rejects an empty pack list", () => {
    expect(() =>
      createNawaitu({
        packs: [],
        classifier: stubClassifier,
        config: fakeConfig,
      }),
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

describe("mergeHooks", () => {
  it("returns an empty Hooks when no layers are passed", () => {
    expect(mergeHooks()).toEqual({});
  });

  it("preserves a single layer's matchers", () => {
    const layer: Hooks = {
      PreToolUse: [{ hooks: [noopHook] }],
    };
    const merged = mergeHooks(layer);
    expect(merged.PreToolUse).toHaveLength(1);
  });

  it("concatenates matchers across layers in argument order", () => {
    const a: Hooks = { PreToolUse: [{ matcher: "from-a", hooks: [noopHook] }] };
    const b: Hooks = { PreToolUse: [{ matcher: "from-b", hooks: [noopHook] }] };
    const c: Hooks = { PreToolUse: [{ matcher: "from-c", hooks: [noopHook] }] };
    const merged = mergeHooks(a, b, c);
    expect(merged.PreToolUse?.map((m) => m.matcher)).toEqual([
      "from-a",
      "from-b",
      "from-c",
    ]);
  });

  it("merges different events independently", () => {
    const a: Hooks = { PreToolUse: [{ hooks: [noopHook] }] };
    const b: Hooks = { PostToolUse: [{ hooks: [noopHook] }] };
    const merged = mergeHooks(a, b);
    expect(merged.PreToolUse).toHaveLength(1);
    expect(merged.PostToolUse).toHaveLength(1);
  });

  it("does not mutate the input layers", () => {
    const a: Hooks = { PreToolUse: [{ matcher: "from-a", hooks: [noopHook] }] };
    const b: Hooks = { PreToolUse: [{ matcher: "from-b", hooks: [noopHook] }] };
    mergeHooks(a, b);
    expect(a.PreToolUse).toHaveLength(1);
    expect(b.PreToolUse).toHaveLength(1);
  });
});

describe("ensureBudget", () => {
  it("does nothing when limit is undefined", () => {
    expect(() => {
      ensureBudget(fakeSession(999), undefined);
    }).not.toThrow();
  });

  it("passes when cumulative is below the limit", () => {
    expect(() => {
      ensureBudget(fakeSession(0.3), 0.5);
    }).not.toThrow();
  });

  it("throws NawaituBudgetExceededError at or over the limit", () => {
    expect(() => {
      ensureBudget(fakeSession(0.5), 0.5);
    }).toThrow(NawaituBudgetExceededError);
    expect(() => {
      ensureBudget(fakeSession(1.2), 0.5);
    }).toThrow(NawaituBudgetExceededError);
  });

  it("the thrown error carries cumulative and limit values", () => {
    try {
      ensureBudget(fakeSession(1.234), 0.5);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(NawaituBudgetExceededError);
      if (err instanceof NawaituBudgetExceededError) {
        expect(err.cumulativeUsd).toBeCloseTo(1.234);
        expect(err.limitUsd).toBe(0.5);
      }
    }
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

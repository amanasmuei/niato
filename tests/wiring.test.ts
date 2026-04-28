import { describe, expect, it } from "vitest";
import {
  createNawaitu,
  genericPack,
  mergeHooks,
  mergePackAgents,
  stubClassifier,
  supportPack,
  NawaituBudgetExceededError,
  type Config,
  type Hooks,
  type SessionContext,
} from "../src/index.js";
import { loadConfig } from "../src/core/config.js";
import { ensureBudget } from "../src/core/compose.js";
import {
  mergePackMcpServers,
  unionAllowedTools,
} from "../src/core/orchestrator/orchestrator.js";
import { SUPPORT_STUB_SERVER_NAME } from "../src/packs/support/tools/support_stub.js";

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

  it("namespaces multiple packs without collision", () => {
    const merged = mergePackAgents([genericPack, supportPack]);
    expect(Object.keys(merged).sort()).toEqual([
      "generic.action",
      "generic.escalate",
      "generic.retrieval",
      "support.escalate",
      "support.kb_search",
      "support.refund_processor",
      "support.ticket_lookup",
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

describe("mergePackMcpServers", () => {
  it("returns an empty map when no pack contributes servers", () => {
    expect(mergePackMcpServers([genericPack])).toEqual({});
  });

  it("includes the support_stub server when supportPack is loaded", () => {
    const merged = mergePackMcpServers([supportPack]);
    expect(Object.keys(merged)).toEqual([SUPPORT_STUB_SERVER_NAME]);
  });

  it("preserves servers across multi-pack composition", () => {
    const merged = mergePackMcpServers([genericPack, supportPack]);
    expect(Object.keys(merged)).toEqual([SUPPORT_STUB_SERVER_NAME]);
  });
});

describe("unionAllowedTools", () => {
  it("always includes the Agent tool", () => {
    expect(unionAllowedTools([genericPack])).toContain("Agent");
  });

  it("collects each specialist's declared tools", () => {
    const tools = unionAllowedTools([genericPack]);
    // Generic.retrieval pulls in read-only tools; Generic.action pulls in
    // write tools. The union is what the orchestrator's allowedTools sees.
    expect(tools).toEqual(
      expect.arrayContaining(["Read", "Write", "Edit", "Bash", "WebSearch"]),
    );
  });

  it("accepts MCP-prefixed tool names from a Phase 4 pack (no real names yet — wiring lands in Step 3)", () => {
    // Step 2 just registers the MCP server; specialist `tools` arrays are
    // still empty until Step 3. This test pins the union shape so Step 3's
    // change is visible: adding a single mcp__support_stub__lookup_ticket
    // entry will show up in this assertion.
    const tools = unionAllowedTools([supportPack]);
    expect(tools).toEqual(["Agent"]);
  });
});

describe("supportPack.route", () => {
  it.each([
    ["order_status", "ticket_lookup"],
    ["refund_request", "refund_processor"],
    ["billing_question", "kb_search"],
    ["account_help", "kb_search"],
    ["complaint", "escalate"],
  ])("maps %s → %s", (intent, expected) => {
    expect(
      supportPack.route({
        intent,
        domain: "support",
        confidence: 1,
      }),
    ).toBe(expected);
  });

  it("returns null for unknown intents", () => {
    expect(
      supportPack.route({
        intent: "unknown_intent",
        domain: "support",
        confidence: 1,
      }),
    ).toBeNull();
  });

  it("declares the five Support intents from ARCHITECTURE.md §7.2", () => {
    const intentNames = supportPack.intents.map((i) => i.name).sort();
    expect(intentNames).toEqual([
      "account_help",
      "billing_question",
      "complaint",
      "order_status",
      "refund_request",
    ]);
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

import { describe, expect, it } from "vitest";
import {
  createNawaitu,
  devToolsPack,
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
import { loadConfig, resolveAuthMode } from "../src/core/config.js";
import { ensureBudget } from "../src/core/compose.js";
import { emptySessionMetrics } from "../src/observability/metrics.js";
import {
  mergePackMcpServers,
  unionAllowedTools,
} from "../src/core/orchestrator/orchestrator.js";
import { SUPPORT_STUB_SERVER_NAME } from "../src/packs/support/tools/support_stub.js";

const noopHook = () => Promise.resolve({ continue: true as const });

function fakeSession(cumulativeCostUsd: number): SessionContext {
  const metrics = emptySessionMetrics();
  metrics.cumulativeCostUsd = cumulativeCostUsd;
  return {
    id: "test-session",
    createdAt: new Date(0),
    metrics,
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

  it("namespaces three packs without collision", () => {
    const merged = mergePackAgents([genericPack, supportPack, devToolsPack]);
    expect(Object.keys(merged).sort()).toEqual([
      "dev_tools.bug_fixer",
      "dev_tools.ci_debugger",
      "dev_tools.code_explainer",
      "dev_tools.codebase_search",
      "generic.action",
      "generic.escalate",
      "generic.retrieval",
      "support.escalate",
      "support.kb_search",
      "support.refund_processor",
      "support.ticket_lookup",
    ]);
  });

  it("preserves Dev Tools specialists' built-in tool allowlists (no MCP)", () => {
    const merged = mergePackAgents([devToolsPack]);
    expect(merged["dev_tools.codebase_search"]?.tools).toEqual([
      "Read",
      "Grep",
      "Glob",
    ]);
    expect(merged["dev_tools.code_explainer"]?.tools).toEqual([
      "Read",
      "Grep",
    ]);
    expect(merged["dev_tools.bug_fixer"]?.tools).toEqual([
      "Read",
      "Edit",
      "Bash",
    ]);
    expect(merged["dev_tools.ci_debugger"]?.tools).toEqual([
      "Read",
      "Grep",
      "WebFetch",
    ]);
  });

  it("preserves Support specialists' MCP tool lists (one MCP tool each, no built-ins)", () => {
    const merged = mergePackAgents([supportPack]);
    expect(merged["support.ticket_lookup"]?.tools).toEqual([
      "mcp__support_stub__lookup_ticket",
    ]);
    expect(merged["support.refund_processor"]?.tools).toEqual([
      "mcp__support_stub__issue_refund",
    ]);
    expect(merged["support.kb_search"]?.tools).toEqual([
      "mcp__support_stub__search_kb",
    ]);
    expect(merged["support.escalate"]?.tools).toEqual([
      "mcp__support_stub__create_priority_ticket",
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

  it("includes the support_stub MCP tool names from each specialist", () => {
    // Each Support specialist declares one MCP tool. The union allowlist
    // exposes them at the orchestrator level — the orchestrator-restriction
    // hook (Phase 3) is what blocks main-thread access; specialists call
    // them via subagent dispatch.
    const tools = unionAllowedTools([supportPack]);
    expect(tools).toEqual(
      expect.arrayContaining([
        "Agent",
        "mcp__support_stub__lookup_ticket",
        "mcp__support_stub__search_kb",
        "mcp__support_stub__issue_refund",
        "mcp__support_stub__create_priority_ticket",
      ]),
    );
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

describe("devToolsPack.route", () => {
  it.each([
    ["find_code", "codebase_search"],
    ["explain_code", "code_explainer"],
    ["fix_bug", "bug_fixer"],
    ["debug_ci", "ci_debugger"],
  ])("maps %s → %s", (intent, expected) => {
    expect(
      devToolsPack.route({
        intent,
        domain: "dev_tools",
        confidence: 1,
      }),
    ).toBe(expected);
  });

  it("returns null for unknown intents (e.g. create_pr deferred to a later phase)", () => {
    expect(
      devToolsPack.route({
        intent: "create_pr",
        domain: "dev_tools",
        confidence: 1,
      }),
    ).toBeNull();
  });

  it("declares the four Phase 5 Dev Tools intents (create_pr deferred)", () => {
    const intentNames = devToolsPack.intents.map((i) => i.name).sort();
    expect(intentNames).toEqual([
      "debug_ci",
      "explain_code",
      "find_code",
      "fix_bug",
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
  it("succeeds without ANTHROPIC_API_KEY (Phase 9: OAuth path)", () => {
    const cfg = loadConfig({});
    expect(cfg.ANTHROPIC_API_KEY).toBeUndefined();
    expect(cfg.NAWAITU_LOG_LEVEL).toBe("info");
  });

  it("succeeds with ANTHROPIC_API_KEY set (API-key path)", () => {
    const cfg = loadConfig({ ANTHROPIC_API_KEY: "sk-test" });
    expect(cfg.ANTHROPIC_API_KEY).toBe("sk-test");
    expect(cfg.NAWAITU_LOG_LEVEL).toBe("info");
  });

  it("rejects an empty-string ANTHROPIC_API_KEY", () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: "" })).toThrow();
  });
});

describe("resolveAuthMode", () => {
  it("returns 'api_key' when ANTHROPIC_API_KEY is set", () => {
    expect(
      resolveAuthMode(loadConfig({ ANTHROPIC_API_KEY: "sk-test" }), {}),
    ).toBe("api_key");
  });

  it("throws NawaituAuthError when neither auth path is configured", () => {
    expect(() => resolveAuthMode(loadConfig({}), {})).toThrow();
  });
});

import { describe, it, expect, vi } from "vitest";
import { createNiato } from "../src/core/compose.js";
import { genericPack } from "../src/packs/generic/index.js";
import {
  buildOrchestratorOptions,
  buildOrchestratorSystemPrompt,
  buildUserMessage,
  type OrchestratorInput,
  type OrchestratorOutput,
} from "../src/core/orchestrator/orchestrator.js";
import {
  buildMemoryPreamble,
  type LongTermMemoryRecord,
  type MemoryStore,
} from "../src/memory/long-term.js";

const stubClassifier = {
  classify: () =>
    Promise.resolve({
      intent: "question" as const,
      domain: "generic" as const,
      confidence: 1,
    }),
};

interface CapturedTurn {
  systemPromptBuilt: string;
  memoryPreamble: string | undefined;
  userMessage: string;
}

function buildStubRunner(captured: CapturedTurn[]): (
  input: OrchestratorInput,
) => Promise<OrchestratorOutput> {
  return (input) => {
    // Recompose the same system prompt the production runner would
    // pass to the SDK. This is the single load-bearing assertion
    // surface for memory wiring — any divergence between what
    // compose.ts threads through and what the orchestrator builds
    // shows up here.
    const systemPromptBuilt = buildOrchestratorSystemPrompt(
      input.persona,
      input.memoryPreamble,
    );
    captured.push({
      systemPromptBuilt,
      memoryPreamble: input.memoryPreamble,
      userMessage: buildUserMessage(input),
    });
    return Promise.resolve({
      result: `echo: ${input.userInput}`,
      messages: [],
    });
  };
}

// In-memory MemoryStore stub. Tests pass a pre-seeded record to verify
// the load path without touching the filesystem.
function stubStore(
  initial?: LongTermMemoryRecord,
): MemoryStore & { written: LongTermMemoryRecord[] } {
  let current = initial;
  const written: LongTermMemoryRecord[] = [];
  return {
    written,
    read: () => Promise.resolve(current),
    write: (_userId, record) => {
      current = record;
      written.push(record);
      return Promise.resolve();
    },
  };
}

const baseConfig = {
  ANTHROPIC_API_KEY: "sk-test",
  NIATO_LOG_LEVEL: "error" as const,
  NIATO_USER_ID: "default",
};

describe("long-term memory wiring", () => {
  it("no memory preamble in system prompt when memory option is omitted", async () => {
    const calls: CapturedTurn[] = [];
    const niato = createNiato({
      packs: [genericPack],
      classifier: stubClassifier,
      orchestratorRunner: vi.fn(buildStubRunner(calls)),
      config: baseConfig,
    });
    await niato.run("hello");
    expect(calls[0]?.memoryPreamble).toBeUndefined();
    // The composed prompt is exactly the operational ORCHESTRATOR_PROMPT.
    expect(calls[0]?.systemPromptBuilt.startsWith("You are the Niato")).toBe(
      true,
    );
  });

  it("preloaded facts appear between persona and ORCHESTRATOR_PROMPT in the system prompt", async () => {
    const calls: CapturedTurn[] = [];
    const store = stubStore({
      version: 1,
      facts: ["Prefers concise answers.", "Lives in Kuala Lumpur."],
      updatedAt: new Date().toISOString(),
    });
    const niato = createNiato({
      packs: [genericPack],
      classifier: stubClassifier,
      orchestratorRunner: vi.fn(buildStubRunner(calls)),
      config: baseConfig,
      persona: {
        name: "Layla",
        description: "Warm, faith-aware companion.",
      },
      memory: { store },
    });
    await niato.run("hi");
    const sys = calls[0]?.systemPromptBuilt ?? "";
    expect(sys).toContain("You are Layla.");
    expect(sys).toContain("Prefers concise answers.");
    expect(sys).toContain("Lives in Kuala Lumpur.");
    expect(sys).toContain("You are the Niato orchestrator.");
    // Composition order: persona → memory → operational prompt.
    expect(sys.indexOf("Layla")).toBeLessThan(
      sys.indexOf("Prefers concise answers."),
    );
    expect(sys.indexOf("Prefers concise answers.")).toBeLessThan(
      sys.indexOf("Niato orchestrator"),
    );
  });

  it("remember() makes the next turn's system prompt contain the new fact", async () => {
    const calls: CapturedTurn[] = [];
    const store = stubStore();
    const niato = createNiato({
      packs: [genericPack],
      classifier: stubClassifier,
      orchestratorRunner: vi.fn(buildStubRunner(calls)),
      config: baseConfig,
      memory: { store },
    });
    await niato.run("turn one");
    expect(calls[0]?.memoryPreamble ?? "").not.toContain("loves green tea");

    await niato.remember(["The user loves green tea."]);
    await niato.run("turn two");
    expect(calls[1]?.systemPromptBuilt).toContain("The user loves green tea.");
    // Persisted, not just cached.
    expect(store.written).toHaveLength(1);
    expect(store.written[0]?.facts).toEqual(["The user loves green tea."]);
  });

  it("specialists do NOT see the memory preamble (invariant #4)", () => {
    // Structural assertion: memory is composed into Options.systemPrompt
    // only. Specialists' prompts come from pack.agents[name].prompt and
    // must never carry the user's memory facts. The user-message channel
    // (buildUserMessage) must also stay clean — anything a specialist
    // needs gets passed via the Agent tool's `prompt` arg by the
    // orchestrator at runtime, not pre-injected at the system level.
    const memoryFact = "SECRET_MEMORY_TOKEN_12345";
    const memoryPreamble = buildMemoryPreamble([memoryFact]);
    const input: OrchestratorInput = {
      userInput: "anything",
      classification: {
        intent: "question",
        domain: "generic",
        confidence: 1,
      },
      packs: [genericPack],
      memoryPreamble,
    };
    const opts = buildOrchestratorOptions(input);
    expect(opts.systemPrompt).toContain(memoryFact);
    // No specialist prompt may carry the memory fact.
    for (const [, def] of Object.entries(opts.agents ?? {})) {
      expect(def.prompt).toBeDefined();
      expect(def.prompt).not.toContain(memoryFact);
    }
    // The user-message channel stays clean too.
    expect(buildUserMessage(input)).not.toContain(memoryFact);
  });

  it("remember() called before the first run() still persists (no race with initial load)", async () => {
    // Regression guard: an earlier draft early-returned when
    // memoryRecord was undefined, which dropped writes silently if
    // remember() was called before any run() forced the load to settle.
    let resolveRead: ((r: LongTermMemoryRecord | undefined) => void) | undefined;
    const writes: LongTermMemoryRecord[] = [];
    const slowStore: MemoryStore = {
      read: () =>
        new Promise<LongTermMemoryRecord | undefined>((resolve) => {
          resolveRead = resolve;
        }),
      write: (_userId, record) => {
        writes.push(record);
        return Promise.resolve();
      },
    };
    const niato = createNiato({
      packs: [genericPack],
      classifier: stubClassifier,
      orchestratorRunner: vi.fn(buildStubRunner([])),
      config: baseConfig,
      memory: { store: slowStore },
    });
    // Kick off remember() before resolving the read.
    const remembered = niato.remember(["early fact"]);
    // Now let the load settle.
    resolveRead?.(undefined);
    await remembered;
    expect(writes).toHaveLength(1);
    expect(writes[0]?.facts).toEqual(["early fact"]);
  });

  it("remember() with no facts after trimming is a no-op", async () => {
    const store = stubStore();
    const niato = createNiato({
      packs: [genericPack],
      classifier: stubClassifier,
      orchestratorRunner: vi.fn(buildStubRunner([])),
      config: baseConfig,
      memory: { store },
    });
    await niato.remember([" ", "", "\t\n"]);
    expect(store.written).toHaveLength(0);
  });

  it("remember() is a no-op when memory option was not configured", async () => {
    const niato = createNiato({
      packs: [genericPack],
      classifier: stubClassifier,
      orchestratorRunner: vi.fn(buildStubRunner([])),
      config: baseConfig,
    });
    // Should resolve cleanly without throwing or persisting anything.
    await expect(niato.remember(["anything"])).resolves.toBeUndefined();
  });

  it("memory.userId option overrides Config.NIATO_USER_ID", async () => {
    const reads: string[] = [];
    const writes: string[] = [];
    const trackingStore: MemoryStore = {
      read: (userId) => {
        reads.push(userId);
        return Promise.resolve(undefined);
      },
      write: (userId, _record) => {
        writes.push(userId);
        return Promise.resolve();
      },
    };
    const niato = createNiato({
      packs: [genericPack],
      classifier: stubClassifier,
      orchestratorRunner: vi.fn(buildStubRunner([])),
      config: { ...baseConfig, NIATO_USER_ID: "config-user" },
      memory: { store: trackingStore, userId: "explicit-user" },
    });
    await niato.run("hi");
    await niato.remember(["a fact"]);
    expect(reads).toContain("explicit-user");
    expect(writes).toContain("explicit-user");
    expect(reads).not.toContain("config-user");
  });
});

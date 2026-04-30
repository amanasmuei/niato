import { describe, it, expect, vi } from "vitest";
import { createNiato } from "../src/core/compose.js";
import { genericPack } from "../src/packs/generic/index.js";
import {
  type OrchestratorInput,
  type OrchestratorOutput,
} from "../src/core/orchestrator/orchestrator.js";

interface CapturedSessionArgs {
  sessionId: string | undefined;
  resume: string | undefined;
}

const stubClassifier = {
  classify: () =>
    Promise.resolve({
      intent: "question" as const,
      domain: "generic" as const,
      confidence: 1,
    }),
};

function buildStubRunner(captured: CapturedSessionArgs[]): (
  input: OrchestratorInput,
) => Promise<OrchestratorOutput> {
  return (input) => {
    captured.push({ sessionId: input.sessionId, resume: input.resume });
    return Promise.resolve({ result: `echo: ${input.userInput}`, messages: [] });
  };
}

describe("conversation memory (v0.4)", () => {
  it("turn 2 in same session uses SDK resume; turn 1 uses sessionId", async () => {
    const calls: CapturedSessionArgs[] = [];
    const stubRun = vi.fn(buildStubRunner(calls));
    const niato = createNiato({
      packs: [genericPack],
      classifier: stubClassifier,
      orchestratorRunner: stubRun,
      config: { ANTHROPIC_API_KEY: "sk-test", NIATO_LOG_LEVEL: "info" },
    });

    const turn1 = await niato.run("turn one");
    expect(calls[0]?.sessionId).toBe(turn1.session.id);
    expect(calls[0]?.resume).toBeUndefined();

    const turn2 = await niato.run("turn two", turn1.session.id);
    expect(calls[1]?.sessionId).toBeUndefined();
    expect(calls[1]?.resume).toBe(turn1.session.id);
    expect(turn2.session.id).toBe(turn1.session.id);
  });

  it("a different sessionId starts fresh (sessionId, not resume)", async () => {
    const calls: CapturedSessionArgs[] = [];
    const stubRun = vi.fn(buildStubRunner(calls));
    const niato = createNiato({
      packs: [genericPack],
      classifier: stubClassifier,
      orchestratorRunner: stubRun,
      config: { ANTHROPIC_API_KEY: "sk-test", NIATO_LOG_LEVEL: "info" },
    });

    await niato.run("a");
    await niato.run("b", "33333333-3333-3333-3333-333333333333");

    expect(calls[0]?.resume).toBeUndefined();
    expect(calls[1]?.resume).toBeUndefined();
    expect(calls[1]?.sessionId).toBe("33333333-3333-3333-3333-333333333333");
  });
});

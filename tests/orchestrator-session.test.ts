import { describe, it, expect } from "vitest";
import { buildOrchestratorOptions } from "../src/core/orchestrator/orchestrator.js";
import { genericPack } from "../src/packs/generic/index.js";

const baseInput = {
  userInput: "hi",
  classification: {
    intent: "question",
    domain: "generic",
    confidence: 0.9,
  },
  packs: [genericPack],
};

describe("buildOrchestratorOptions", () => {
  it("includes sessionId and cwd when starting a new session", () => {
    const opts = buildOrchestratorOptions({
      ...baseInput,
      sessionId: "11111111-1111-1111-1111-111111111111",
      cwd: "/tmp/niato-sessions",
    });
    expect(opts.sessionId).toBe("11111111-1111-1111-1111-111111111111");
    expect(opts.cwd).toBe("/tmp/niato-sessions");
    expect(opts.resume).toBeUndefined();
  });

  it("includes resume and cwd when resuming an existing session", () => {
    const opts = buildOrchestratorOptions({
      ...baseInput,
      resume: "22222222-2222-2222-2222-222222222222",
      cwd: "/tmp/niato-sessions",
    });
    expect(opts.resume).toBe("22222222-2222-2222-2222-222222222222");
    expect(opts.sessionId).toBeUndefined();
    expect(opts.cwd).toBe("/tmp/niato-sessions");
  });

  it("omits sessionId/resume when neither is provided", () => {
    const opts = buildOrchestratorOptions(baseInput);
    expect(opts.sessionId).toBeUndefined();
    expect(opts.resume).toBeUndefined();
  });

  it("rejects passing both sessionId and resume", () => {
    expect(() =>
      buildOrchestratorOptions({
        ...baseInput,
        sessionId: "11111111-1111-1111-1111-111111111111",
        resume: "22222222-2222-2222-2222-222222222222",
      }),
    ).toThrow(/mutually exclusive/i);
  });
});

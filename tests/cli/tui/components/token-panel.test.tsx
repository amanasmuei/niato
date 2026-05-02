import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { TokenPanel } from "../../../../src/cli/tui/components/token-panel.js";
import { type TurnRecord } from "../../../../src/observability/trace.js";

const fakeTrace: TurnRecord = {
  sessionId: "s",
  turnId: "t",
  classification: { domain: "generic", intent: "explain", confidence: 0.9 },
  plan: ["generic.explain"],
  specialists: [],
  costUsd: 0.0034,
  startedAt: "2026-01-01T00:00:00.000Z",
  latencyMs: 2100,
  tokensByModel: {
    "claude-sonnet-4-6-20260101": {
      inputTokens: 421,
      outputTokens: 312,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    },
  },
  outcome: "success",
  guardrailsTriggered: [],
};

describe("TokenPanel", () => {
  it("renders model row + cost + latency", () => {
    const { lastFrame } = render(<TokenPanel trace={fakeTrace} />);
    const out = lastFrame() ?? "";
    expect(out).toContain("sonnet-4-6");
    expect(out).toContain("421 in");
    expect(out).toContain("$0.0034");
    expect(out).toMatch(/2\.1s/);
  });
});

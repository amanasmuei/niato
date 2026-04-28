import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Footer } from "../../../../src/cli/tui/components/footer.js";
import { type TurnRecord } from "../../../../src/observability/trace.js";

const fakeTrace: TurnRecord = {
  sessionId: "s",
  turnId: "t",
  classification: { domain: "generic", intent: "explain", confidence: 0.92 },
  plan: ["generic.explain"],
  specialists: [],
  costUsd: 0.0034,
  latencyMs: 2100,
  tokensByModel: {},
  outcome: "success",
  guardrailsTriggered: [],
};

describe("Footer", () => {
  it("casual mode: one-line summary", () => {
    const { lastFrame } = render(
      <Footer
        mode="casual"
        phase="done"
        classification={fakeTrace.classification}
        trace={fakeTrace}
      />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("✓ classify");
    expect(out).toContain("✓ dispatch");
    expect(out).toContain("$0.0034");
    expect(out).toMatch(/2\.1s/);
  });

  it("dev mode: adds dispatch path", () => {
    const { lastFrame } = render(
      <Footer
        mode="dev"
        phase="done"
        classification={fakeTrace.classification}
        trace={fakeTrace}
      />,
    );
    expect(lastFrame()).toContain("generic.explain");
  });

  it("idle phase: shows waiting hint", () => {
    const { lastFrame } = render(<Footer mode="casual" phase="idle" />);
    expect(lastFrame()).toMatch(/ready|waiting|·/);
  });
});

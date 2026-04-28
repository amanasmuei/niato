import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { PhaseLine } from "../../../../src/cli/tui/components/phase-line.js";

describe("PhaseLine", () => {
  it("shows ✓ when done", () => {
    const { lastFrame } = render(
      <PhaseLine label="Classify" active={false} done={true} failed={false} />,
    );
    expect(lastFrame()).toMatch(/✓\s+Classify/);
  });

  it("shows ✗ when failed", () => {
    const { lastFrame } = render(
      <PhaseLine label="Dispatch" active={false} done={false} failed={true} />,
    );
    expect(lastFrame()).toMatch(/✗\s+Dispatch/);
  });

  it("renders detail when provided", () => {
    const { lastFrame } = render(
      <PhaseLine
        label="Classify"
        active={false}
        done={true}
        failed={false}
        detail="generic/explain (92%)"
      />,
    );
    expect(lastFrame()).toContain("generic/explain (92%)");
  });
});

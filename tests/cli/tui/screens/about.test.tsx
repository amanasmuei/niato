import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { About } from "../../../../src/cli/tui/screens/about.js";

describe("About screen", () => {
  it("renders version and license info", () => {
    const { lastFrame } = render(
      <About version="0.1.0" onBack={() => undefined} />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("Niato");
    expect(out).toContain("0.1.0");
    expect(out).toMatch(/license/i);
  });
});

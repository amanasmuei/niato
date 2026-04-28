import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { FirstRun } from "../../../../src/cli/tui/screens/first-run.js";

describe("FirstRun screen — auth pick step", () => {
  it("renders both auth options", () => {
    const { lastFrame } = render(<FirstRun onAuthPicked={() => undefined} />);
    const out = lastFrame() ?? "";
    expect(out).toContain("Claude subscription");
    expect(out).toContain("API key");
  });

  it("emits onAuthPicked('subscription') when subscription selected", async () => {
    let picked: string | undefined;
    const { stdin } = render(
      <FirstRun
        onAuthPicked={(mode) => {
          picked = mode;
        }}
      />,
    );
    stdin.write("\r"); // enter on first item
    await new Promise((r) => setImmediate(r));
    expect(picked).toBe("subscription");
  });
});

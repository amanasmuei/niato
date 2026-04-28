import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Launcher } from "../../../../src/cli/tui/screens/launcher.js";
import { type Companion } from "../../../../src/cli/companion-config.js";

const companion: Companion = {
  version: 1,
  name: "Arienz",
  voice: "warm",
  createdAt: "2026-04-28T00:00:00Z",
};

describe("Launcher screen", () => {
  it("shows the four lean menu items + greeting", () => {
    const { lastFrame } = render(
      <Launcher
        companion={companion}
        hasResumable={true}
        onSelect={() => undefined}
      />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("New session");
    expect(out).toContain("Resume last");
    expect(out).toContain("Settings");
    expect(out).toContain("About");
    expect(out).toContain("Arienz");
  });

  it("disables Resume last when no resumable session exists", () => {
    const { lastFrame } = render(
      <Launcher
        companion={companion}
        hasResumable={false}
        onSelect={() => undefined}
      />,
    );
    expect(lastFrame()).toContain("Resume last");
    // The disabled Menu item is gray; arrow won't sit on it. Best assertion
    // is that arrow is on "New session".
    expect(lastFrame()).toMatch(/▸\s+New session/);
  });
});

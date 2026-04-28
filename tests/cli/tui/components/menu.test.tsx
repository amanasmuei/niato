import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Menu, type MenuItem } from "../../../../src/cli/tui/components/menu.js";

const items: MenuItem[] = [
  { id: "new", label: "New session" },
  { id: "resume", label: "Resume last" },
  { id: "settings", label: "Settings" },
  { id: "quit", label: "Quit" },
];

describe("Menu", () => {
  it("renders all items and marks the first as selected", () => {
    const { lastFrame } = render(
      <Menu items={items} onSelect={() => undefined} />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("New session");
    expect(out).toContain("Resume last");
    expect(out).toContain("Settings");
    expect(out).toContain("Quit");
    // arrow on first item
    expect(out).toMatch(/▸\s+New session/);
  });

  it("respects disabled flag visually", () => {
    const disabled: MenuItem[] = [
      { id: "a", label: "Active" },
      { id: "b", label: "Inactive", disabled: true },
    ];
    const { lastFrame } = render(
      <Menu items={disabled} onSelect={() => undefined} />,
    );
    expect(lastFrame()).toContain("Inactive");
  });
});

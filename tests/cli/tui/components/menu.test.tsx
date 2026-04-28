import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Menu, type MenuItem } from "../../../../src/cli/tui/components/menu.js";

const items: MenuItem[] = [
  { id: "new", label: "New session" },
  { id: "resume", label: "Resume last" },
  { id: "settings", label: "Settings" },
  { id: "quit", label: "Quit" },
];

const ARROW_DOWN = "[B";
const ENTER = "\r";
const ESC = "";

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

  it("down arrow skips disabled items and Enter fires onSelect with the right id", async () => {
    const navItems: MenuItem[] = [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Bravo", disabled: true },
      { id: "c", label: "Charlie" },
    ];
    const onSelect = vi.fn();
    const { stdin } = render(<Menu items={navItems} onSelect={onSelect} />);

    stdin.write(ARROW_DOWN);
    await new Promise((r) => setImmediate(r));
    stdin.write(ENTER);
    await new Promise((r) => setImmediate(r));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("Esc fires onCancel and does not fire onSelect", async () => {
    const escItems: MenuItem[] = [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Bravo" },
    ];
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const { stdin } = render(
      <Menu items={escItems} onSelect={onSelect} onCancel={onCancel} />,
    );

    stdin.write(ESC);
    // Ink debounces a bare ESC by ~20ms to detect chunked escape sequences;
    // wait long enough for the pending-flush timer to fire.
    await new Promise((r) => setTimeout(r, 50));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

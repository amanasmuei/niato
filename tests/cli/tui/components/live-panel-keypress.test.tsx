import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { LivePanel } from "../../../../src/cli/tui/components/live-panel.js";

describe("LivePanel keypress", () => {
  it("calls onApprove when 'a' pressed and pendingApproval is set", async () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    const { stdin } = render(
      <LivePanel
        events={[]}
        pendingApproval={{
          approvalId: "tu_3",
          toolName: "x",
          toolInput: {},
          reason: "r",
        }}
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );
    stdin.write("a");
    await new Promise((r) => setTimeout(r, 10));
    expect(onApprove).toHaveBeenCalledWith("tu_3");
    expect(onDeny).not.toHaveBeenCalled();
  });

  it("calls onDeny when 'd' pressed", async () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    const { stdin } = render(
      <LivePanel
        events={[]}
        pendingApproval={{
          approvalId: "tu_3",
          toolName: "x",
          toolInput: {},
          reason: "r",
        }}
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );
    stdin.write("d");
    await new Promise((r) => setTimeout(r, 10));
    expect(onDeny).toHaveBeenCalledWith("tu_3");
  });

  it("ignores keypresses when pendingApproval is undefined", async () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    const { stdin } = render(
      <LivePanel
        events={[]}
        pendingApproval={undefined}
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );
    stdin.write("a");
    stdin.write("d");
    await new Promise((r) => setTimeout(r, 10));
    expect(onApprove).not.toHaveBeenCalled();
    expect(onDeny).not.toHaveBeenCalled();
  });
});

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { LivePanel } from "../../../../src/cli/tui/components/live-panel.js";
import { type NiatoEvent } from "../../../../src/observability/events.js";

const dispatched: NiatoEvent = {
  type: "specialist_dispatched",
  toolUseId: "tu_1",
  specialist: "support.refund_processor",
};
const toolCall: NiatoEvent = {
  type: "tool_call",
  parentToolUseId: "tu_1",
  toolUseId: "tu_2",
  toolName: "Read",
  inputPreview: '{"file_path":"/tmp/x"}',
};
const toolOk: NiatoEvent = {
  type: "tool_result",
  toolUseId: "tu_2",
  outcome: "ok",
  preview: "file contents",
  reason: undefined,
};
const toolBlocked: NiatoEvent = {
  type: "tool_result",
  toolUseId: "tu_2",
  outcome: "blocked",
  preview: '{"amount_usd":600}',
  reason: "over $500 limit",
};

describe("LivePanel", () => {
  it("renders specialist row when dispatched", () => {
    const { lastFrame } = render(
      <LivePanel events={[dispatched]} pendingApproval={undefined} />,
    );
    expect(lastFrame()).toContain("support.refund_processor");
  });

  it("renders tool call indented under specialist", () => {
    const { lastFrame } = render(
      <LivePanel events={[dispatched, toolCall]} pendingApproval={undefined} />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("Read");
    // Tree-style branch indicator (├ or └) signals indent under specialist.
    expect(out).toMatch(/├|└|→/);
  });

  it("renders ✓ for ok tool result", () => {
    const { lastFrame } = render(
      <LivePanel
        events={[dispatched, toolCall, toolOk]}
        pendingApproval={undefined}
      />,
    );
    expect(lastFrame()).toMatch(/✓|ok/);
  });

  it("renders ⊘ for blocked result with reason", () => {
    const { lastFrame } = render(
      <LivePanel
        events={[dispatched, toolCall, toolBlocked]}
        pendingApproval={undefined}
      />,
    );
    const out = lastFrame() ?? "";
    expect(out).toMatch(/⊘|blocked/);
    expect(out).toContain("over $500 limit");
  });

  it("renders pending approval prompt when supplied", () => {
    const { lastFrame } = render(
      <LivePanel
        events={[dispatched]}
        pendingApproval={{
          approvalId: "tu_3",
          toolName: "mcp__billing__refund",
          toolInput: { amount_usd: 600 },
          reason: "over $500 limit",
        }}
      />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("approval");
    expect(out).toMatch(/\[a\]|allow/i);
    expect(out).toMatch(/\[d\]|deny/i);
  });
});

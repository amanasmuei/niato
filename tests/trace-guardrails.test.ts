import { describe, expect, it } from "vitest";
import { type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { extractGuardrailsTriggered } from "../src/index.js";

// Synthetic SDK result messages that match the SDKResultSuccess /
// SDKResultError shape. We only set the fields extractGuardrailsTriggered
// reads — typed as SDKMessage via cast since the SDK union has many
// other required fields irrelevant to this test surface.

function resultSuccess(
  permissionDenials: { tool_name: string; tool_use_id: string }[],
): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    permission_denials: permissionDenials,
    // The other SDKResultSuccess fields are not read by the extractor.
  } as unknown as SDKMessage;
}

function resultError(
  permissionDenials: { tool_name: string; tool_use_id: string }[],
): SDKMessage {
  return {
    type: "result",
    subtype: "error_during_execution",
    permission_denials: permissionDenials,
  } as unknown as SDKMessage;
}

function assistantMsg(): SDKMessage {
  return {
    type: "assistant",
    message: { content: [] },
    parent_tool_use_id: null,
  } as unknown as SDKMessage;
}

describe("extractGuardrailsTriggered", () => {
  it("returns an empty array when no result message has denials", () => {
    expect(extractGuardrailsTriggered([resultSuccess([])])).toEqual([]);
  });

  it("returns an empty array when the message stream is empty", () => {
    expect(extractGuardrailsTriggered([])).toEqual([]);
  });

  it("collects tool_name values from a single result-success message", () => {
    const messages = [
      assistantMsg(),
      resultSuccess([
        { tool_name: "Bash", tool_use_id: "tu_1" },
        {
          tool_name: "mcp__support_stub__issue_refund",
          tool_use_id: "tu_2",
        },
      ]),
    ];
    expect(extractGuardrailsTriggered(messages)).toEqual([
      "Bash",
      "mcp__support_stub__issue_refund",
    ]);
  });

  it("preserves duplicate tool_names when the same tool was denied twice", () => {
    const messages = [
      resultSuccess([
        { tool_name: "Bash", tool_use_id: "tu_1" },
        { tool_name: "Bash", tool_use_id: "tu_2" },
      ]),
    ];
    expect(extractGuardrailsTriggered(messages)).toEqual(["Bash", "Bash"]);
  });

  it("also reads denials from result-error messages (turn ended badly)", () => {
    const messages = [
      resultError([{ tool_name: "Edit", tool_use_id: "tu_1" }]),
    ];
    expect(extractGuardrailsTriggered(messages)).toEqual(["Edit"]);
  });

  it("ignores other result subtypes (e.g. error_max_turns)", () => {
    const messages = [
      {
        type: "result",
        subtype: "error_max_turns",
        permission_denials: [{ tool_name: "Bash", tool_use_id: "tu_1" }],
      } as unknown as SDKMessage,
    ];
    expect(extractGuardrailsTriggered(messages)).toEqual([]);
  });

  it("tolerates messages that lack permission_denials entirely", () => {
    const messages = [
      {
        type: "result",
        subtype: "success",
        // permission_denials missing
      } as unknown as SDKMessage,
    ];
    expect(extractGuardrailsTriggered(messages)).toEqual([]);
  });

  it("ignores assistant / user / system messages", () => {
    expect(extractGuardrailsTriggered([assistantMsg()])).toEqual([]);
  });
});

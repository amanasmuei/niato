import { describe, it, expect } from "vitest";
import { type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { messagesToEvents } from "../../src/observability/event-stream.js";
import { expectDefined } from "../cli/tui/_helpers/expect-defined.js";

// Minimal SDK-shaped fixtures. The orchestrator dispatches one specialist
// (Agent tool, parent_tool_use_id=null), the specialist runs one tool
// (parent_tool_use_id=<dispatch id>), the tool returns ok, the turn
// settles. We assert the translator emits the right NiatoEvent stream.
function asAssistantMessage(
  parentToolUseId: string | null,
  blocks: unknown[],
): SDKMessage {
  // Cast: SDKMessage's exhaustive union is too narrow for hand-built
  // fixtures; the runtime shape matches what the SDK emits.
  return {
    type: "assistant",
    parent_tool_use_id: parentToolUseId,
    message: { content: blocks },
  } as unknown as SDKMessage;
}

function asUserToolResult(toolUseId: string, content: string): SDKMessage {
  return {
    type: "user",
    parent_tool_use_id: null,
    message: {
      content: [{ type: "tool_result", tool_use_id: toolUseId, content }],
    },
  } as unknown as SDKMessage;
}

describe("messagesToEvents", () => {
  it("emits specialist_dispatched when orchestrator calls Agent tool", () => {
    const messages: SDKMessage[] = [
      asAssistantMessage(null, [
        {
          type: "tool_use",
          id: "tu_1",
          name: "Agent",
          input: { subagent_type: "support.refund_processor", prompt: "go" },
        },
      ]),
    ];
    const events = messagesToEvents(messages);
    expect(events).toEqual([
      {
        type: "specialist_dispatched",
        toolUseId: "tu_1",
        specialist: "support.refund_processor",
      },
    ]);
  });

  it("emits tool_call for specialist's nested tool use", () => {
    const messages: SDKMessage[] = [
      asAssistantMessage("tu_1", [
        {
          type: "tool_use",
          id: "tu_2",
          name: "Read",
          input: { file_path: "/tmp/x" },
        },
      ]),
    ];
    const events = messagesToEvents(messages);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool_call",
      parentToolUseId: "tu_1",
      toolUseId: "tu_2",
      toolName: "Read",
    });
  });

  it("emits tool_result with outcome=ok for non-error tool_result", () => {
    const messages: SDKMessage[] = [
      asUserToolResult("tu_2", "file contents"),
    ];
    const events = messagesToEvents(messages);
    expect(events).toEqual([
      {
        type: "tool_result",
        toolUseId: "tu_2",
        outcome: "ok",
        preview: "file contents",
        reason: undefined,
      },
    ]);
  });

  it("emits tool_result with outcome=blocked for permission denials in result", () => {
    const messages: SDKMessage[] = [
      {
        type: "result",
        subtype: "success",
        result: "done",
        permission_denials: [
          { tool_name: "mcp__billing__refund", tool_use_id: "tu_3" },
        ],
        modelUsage: {},
        total_cost_usd: 0,
      } as unknown as SDKMessage,
    ];
    const events = messagesToEvents(messages);
    const blocked = events.find((e) => e.type === "tool_result");
    expect(blocked).toMatchObject({
      type: "tool_result",
      toolUseId: "tu_3",
      outcome: "blocked",
    });
  });

  it("inputPreview is capped at 80 chars with ellipsis for oversize JSON", () => {
    const longInput = { file_path: "x".repeat(200) };
    const messages: SDKMessage[] = [
      asAssistantMessage("tu_1", [
        {
          type: "tool_use",
          id: "tu_2",
          name: "Read",
          input: longInput,
        },
      ]),
    ];
    const events = messagesToEvents(messages);
    const toolCall = expectDefined(
      events.find((e) => e.type === "tool_call"),
      "expected tool_call event",
    );
    expect(toolCall.inputPreview.length).toBe(80);
    expect(toolCall.inputPreview.endsWith("…")).toBe(true);
  });

  it("preview is capped at 120 chars with ellipsis for oversize tool result", () => {
    const messages: SDKMessage[] = [
      asUserToolResult("tu_2", "x".repeat(500)),
    ];
    const events = messagesToEvents(messages);
    const result = expectDefined(
      events.find((e) => e.type === "tool_result"),
      "expected tool_result event",
    );
    expect(result.preview.length).toBe(120);
    expect(result.preview.endsWith("…")).toBe(true);
  });

  it("emits tool_result with outcome=error when is_error is true", () => {
    const messages: SDKMessage[] = [
      {
        type: "user",
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu_4",
              content: "boom",
              is_error: true,
            },
          ],
        },
      } as unknown as SDKMessage,
    ];
    const events = messagesToEvents(messages);
    expect(events).toEqual([
      {
        type: "tool_result",
        toolUseId: "tu_4",
        outcome: "error",
        preview: "boom",
        reason: undefined,
      },
    ]);
  });

  it("treats legacy 'Task' tool name as a specialist dispatch alias for 'Agent'", () => {
    const messages: SDKMessage[] = [
      asAssistantMessage(null, [
        {
          type: "tool_use",
          id: "tu_5",
          name: "Task",
          input: { subagent_type: "support.refund_processor", prompt: "go" },
        },
      ]),
    ];
    const events = messagesToEvents(messages);
    expect(events).toEqual([
      {
        type: "specialist_dispatched",
        toolUseId: "tu_5",
        specialist: "support.refund_processor",
      },
    ]);
  });
});

import { type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { type NiatoEvent } from "./events.js";

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}

function isToolUseBlock(b: unknown): b is ToolUseBlock {
  if (typeof b !== "object" || b === null) return false;
  const x = b as Record<string, unknown>;
  return (
    x["type"] === "tool_use" &&
    typeof x["id"] === "string" &&
    typeof x["name"] === "string" &&
    typeof x["input"] === "object" &&
    x["input"] !== null
  );
}

function isToolResultBlock(b: unknown): b is ToolResultBlock {
  if (typeof b !== "object" || b === null) return false;
  const x = b as Record<string, unknown>;
  return x["type"] === "tool_result" && typeof x["tool_use_id"] === "string";
}

function previewJson(value: unknown, max: number): string {
  const json = JSON.stringify(value);
  if (typeof json !== "string") return "";
  return json.length > max ? `${json.slice(0, max - 1)}…` : json;
}

function previewText(value: unknown, max: number): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (typeof s !== "string") return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Pure translator: SDKMessage[] → NiatoEvent[]. Stateless, deterministic,
// safe to call repeatedly (e.g. on every render in tests). Production
// callers stream incrementally via runOrchestrator's onEvent callback;
// this batch form exists for tests and for retroactive replay.
//
// Coverage note: this translator handles the SDK-derived event subset
// (specialist_dispatched, tool_call, tool_result). Lifecycle events
// (turn_start, classified, turn_complete) and approval events
// (approval_requested, approval_resolved) are emitted out-of-band by
// runOrchestrator (Task 3) and ApprovalChannel (Task 2) respectively.
//
// Blocked-tool dedup: a hook-denied tool call can surface twice — once
// as an `is_error: true` tool_result (outcome: "error") and once via
// `permission_denials` (outcome: "blocked") — sharing the same
// `toolUseId`. The translator emits both faithfully; downstream
// consumers should dedupe by `toolUseId` if displaying a single row
// per tool call.
export function messagesToEvents(messages: SDKMessage[]): NiatoEvent[] {
  const events: NiatoEvent[] = [];
  for (const msg of messages) {
    if (msg.type === "assistant") {
      const parent = msg.parent_tool_use_id;
      const content: unknown = msg.message.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (!isToolUseBlock(block)) continue;
        if (block.name === "Agent" || block.name === "Task") {
          if (parent !== null) continue;
          const subagentType = block.input["subagent_type"];
          if (typeof subagentType !== "string") continue;
          events.push({
            type: "specialist_dispatched",
            toolUseId: block.id,
            specialist: subagentType,
          });
        } else {
          events.push({
            type: "tool_call",
            parentToolUseId: parent,
            toolUseId: block.id,
            toolName: block.name,
            inputPreview: previewJson(block.input, 80),
          });
        }
      }
    } else if (msg.type === "user") {
      const content: unknown = msg.message.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (!isToolResultBlock(block)) continue;
        events.push({
          type: "tool_result",
          toolUseId: block.tool_use_id,
          outcome: block.is_error === true ? "error" : "ok",
          preview: previewText(block.content, 120),
          reason: undefined,
        });
      }
    } else if (msg.type === "result") {
      // Mirrors trace.ts extractGuardrailsTriggered: every
      // SDKResultMessage subtype carries `permission_denials`, so no
      // subtype filter is needed — any result that ended a turn after a
      // hook denial must surface those denials as blocked tool_result
      // events. If the SDK adds a result subtype without the field, the
      // direct field access fails to typecheck and forces a re-look.
      for (const d of msg.permission_denials) {
        if (typeof d.tool_use_id !== "string") continue;
        events.push({
          type: "tool_result",
          toolUseId: d.tool_use_id,
          outcome: "blocked",
          preview: previewJson(d.tool_input, 120),
          reason: undefined,
        });
      }
    }
  }
  return events;
}

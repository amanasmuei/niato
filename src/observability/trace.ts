import { type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { type IntentResult } from "../core/classifier/types.js";

export interface TurnTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface TurnSpecialistRecord {
  name: string;
  toolCalls: number;
}

export interface TurnRecord {
  sessionId: string;
  turnId: string;
  classification: IntentResult;
  plan: string[];
  specialists: TurnSpecialistRecord[];
  tokensByModel: Record<string, TurnTokenUsage>;
  costUsd: number;
  latencyMs: number;
  outcome: "success" | "error";
  guardrailsTriggered: string[];
}

interface ToolUseBlockShape {
  type: string;
  id: string;
  name: string;
  input: { subagent_type?: unknown };
}

function isToolUseBlock(block: unknown): block is ToolUseBlockShape {
  if (typeof block !== "object" || block === null) return false;
  const b = block as Record<string, unknown>;
  return (
    b["type"] === "tool_use" &&
    typeof b["id"] === "string" &&
    typeof b["name"] === "string" &&
    typeof b["input"] === "object" &&
    b["input"] !== null
  );
}

// Returns the ordered list of tool_name values that the SDK's permission
// pipeline denied during this turn. Sourced from the canonical
// `permission_denials: SDKPermissionDenial[]` field on the result message
// — no message-content scanning. Each denied tool call appears once per
// (tool_use_id), preserving order. Drives `TurnRecord.guardrailsTriggered`.
export function extractGuardrailsTriggered(messages: SDKMessage[]): string[] {
  const triggered: string[] = [];
  for (const msg of messages) {
    if (msg.type !== "result") continue;
    if (msg.subtype !== "success" && msg.subtype !== "error_during_execution")
      continue;
    const denials = (
      msg as { permission_denials?: { tool_name: string }[] }
    ).permission_denials;
    if (!Array.isArray(denials)) continue;
    for (const d of denials) {
      if (typeof d.tool_name === "string") triggered.push(d.tool_name);
    }
  }
  return triggered;
}

// Returns the ordered list of `subagent_type` values dispatched by the
// orchestrator (top-level Agent tool calls). The dispatch tool was renamed
// `Task` → `Agent` in Claude Code v2.1.63; both names can appear depending
// on SDK version.
export function extractAgentDispatches(messages: SDKMessage[]): string[] {
  const dispatches: string[] = [];
  for (const msg of messages) {
    if (msg.type !== "assistant") continue;
    if (msg.parent_tool_use_id !== null) continue;
    const content: unknown = msg.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!isToolUseBlock(block)) continue;
      if (block.name !== "Agent" && block.name !== "Task") continue;
      const subagentType = block.input.subagent_type;
      if (typeof subagentType === "string") dispatches.push(subagentType);
    }
  }
  return dispatches;
}

export interface BuildTurnRecordArgs {
  sessionId: string;
  turnId: string;
  classification: IntentResult;
  messages: SDKMessage[];
  latencyMs: number;
}

export function buildTurnRecord(args: BuildTurnRecordArgs): TurnRecord {
  const dispatchEntries: { id: string; name: string }[] = [];
  const toolCallsByParent: Record<string, number> = {};

  for (const msg of args.messages) {
    if (msg.type !== "assistant") continue;
    const content: unknown = msg.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!isToolUseBlock(block)) continue;
      const isDispatch = block.name === "Agent" || block.name === "Task";
      if (isDispatch && msg.parent_tool_use_id === null) {
        const subagentType = block.input.subagent_type;
        if (typeof subagentType === "string") {
          dispatchEntries.push({ id: block.id, name: subagentType });
        }
      } else if (msg.parent_tool_use_id !== null) {
        const parent = msg.parent_tool_use_id;
        toolCallsByParent[parent] = (toolCallsByParent[parent] ?? 0) + 1;
      }
    }
  }

  const tokensByModel: Record<string, TurnTokenUsage> = {};
  let costUsd = 0;
  let outcome: "success" | "error" = "error";

  for (const msg of args.messages) {
    if (msg.type !== "result") continue;
    if (msg.subtype === "success") {
      outcome = "success";
      costUsd = msg.total_cost_usd;
      for (const [model, usage] of Object.entries(msg.modelUsage)) {
        tokensByModel[model] = {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadInputTokens: usage.cacheReadInputTokens,
          cacheCreationInputTokens: usage.cacheCreationInputTokens,
        };
      }
    }
  }

  return {
    sessionId: args.sessionId,
    turnId: args.turnId,
    classification: args.classification,
    plan: dispatchEntries.map((d) => d.name),
    specialists: dispatchEntries.map((d) => ({
      name: d.name,
      toolCalls: toolCallsByParent[d.id] ?? 0,
    })),
    tokensByModel,
    costUsd,
    latencyMs: args.latencyMs,
    outcome,
    guardrailsTriggered: extractGuardrailsTriggered(args.messages),
  };
}

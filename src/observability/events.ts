import { type IntentResult } from "../core/classifier/types.js";
import { type TurnRecord } from "./trace.js";

// Live event stream emitted by Niato.runStream(). Discriminated by `type`.
// Consumers (TUI panels, audit log adapters, telemetry exporters) pattern-
// match on `type` to render or record. Field ordering is stable: every
// new event variant goes at the end of the union.
export type NiatoEvent =
  | NiatoTurnStartEvent
  | NiatoClassifiedEvent
  | NiatoSpecialistDispatchedEvent
  | NiatoToolCallEvent
  | NiatoToolResultEvent
  | NiatoApprovalRequestedEvent
  | NiatoApprovalResolvedEvent
  | NiatoTurnFailedEvent
  | NiatoTurnCompleteEvent;

export interface NiatoTurnStartEvent {
  type: "turn_start";
  sessionId: string;
  turnId: string;
  userInput: string;
}

export interface NiatoClassifiedEvent {
  type: "classified";
  classification: IntentResult;
}

export interface NiatoSpecialistDispatchedEvent {
  type: "specialist_dispatched";
  // SDK-issued id of the orchestrator's `Agent` tool_use block. Used as
  // the parent_tool_use_id of the specialist's downstream tool_use blocks
  // — that's how the translator groups tool calls under their specialist.
  toolUseId: string;
  // Namespaced "<pack>.<specialist>" — the value of `subagent_type`.
  specialist: string;
}

export interface NiatoToolCallEvent {
  type: "tool_call";
  // null when emitted at orchestrator scope (rare — orchestrator is
  // restricted to `Agent`). Almost always the dispatched specialist's id.
  parentToolUseId: string | null;
  toolUseId: string;
  toolName: string;
  // JSON.stringify(toolInput) capped to 80 chars for UI; the full input
  // is recoverable from the underlying SDK messages.
  inputPreview: string;
}

export interface NiatoToolResultEvent {
  type: "tool_result";
  toolUseId: string;
  outcome: "ok" | "error" | "blocked";
  // Capped to 120 chars; UI shows preview, full content available via
  // SDK message inspection.
  preview: string;
  // For blocked outcomes: populated by upstream emitters (e.g.
  // runOrchestrator's PreToolUse hook reason via
  // PreToolUseHookSpecificOutput.permissionDecisionReason). The pure
  // SDKMessage translator leaves this `undefined` because
  // SDKPermissionDenial carries no reason field.
  reason: string | undefined;
}

export interface NiatoApprovalRequestedEvent {
  type: "approval_requested";
  // Equals the `tool_use_id` of the pending tool call; used as the
  // ApprovalChannel correlation key.
  approvalId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  reason: string;
}

export interface NiatoApprovalResolvedEvent {
  type: "approval_resolved";
  approvalId: string;
  decision: "allow" | "deny";
  // User-supplied (or hook-supplied) explanation. `undefined` when the
  // user just hit a key without typing a reason.
  reason: string | undefined;
}

export interface NiatoTurnFailedEvent {
  type: "turn_failed";
  // The turnId from the matching turn_start. Lets consumers correlate
  // the failure to the right in-flight turn (LivePanel resets the panel
  // for that turnId; useLiveEvents.push then advances state out of the
  // running phase).
  turnId: string;
  // Stringified error message — the original Error object is not
  // serializable across the synchronous emit boundary in a stable shape.
  // Producer responsibility: `err instanceof Error ? err.message : String(err)`.
  error: string;
}

export interface NiatoTurnCompleteEvent {
  type: "turn_complete";
  trace: TurnRecord;
}

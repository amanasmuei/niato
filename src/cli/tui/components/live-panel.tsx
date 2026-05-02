import React from "react";
import { Box, Text, useInput } from "ink";
import { type NiatoEvent } from "../../../observability/events.js";
import { type ApprovalRequest } from "../../../guardrails/approval-channel.js";

export interface LivePanelProps {
  events: NiatoEvent[];
  pendingApproval: ApprovalRequest | undefined;
  // Keypress callbacks. Both are optional so the read-only render mode
  // (used by the existing live-panel.test.tsx fixtures and any future
  // headless caller) keeps working without supplying handlers. The
  // explicit `| undefined` on the outer is required by the project's
  // `exactOptionalPropertyTypes: true` so callers may pass `undefined`
  // explicitly without a conditional spread.
  onApprove?: ((approvalId: string) => void) | undefined;
  onDeny?: ((approvalId: string) => void) | undefined;
}

interface SpecialistRow {
  toolUseId: string;
  specialist: string;
  tools: ToolRow[];
}

interface ToolRow {
  toolUseId: string;
  name: string;
  inputPreview: string;
  result:
    | { outcome: "ok" | "error" | "blocked"; reason: string | undefined }
    | undefined;
}

// Folds the flat NiatoEvent[] timeline into a hierarchical tree:
// one row per specialist_dispatched, with each tool_call grouped
// under its parent. tool_result events update the matching tool row.
//
// Silent-drop semantics (intentional, not bugs):
//
//   1. tool_call with `parentToolUseId` not in the rows map: dropped.
//      The orchestrator's allowedTools is ["Agent"] (CLAUDE.md §1) so
//      orphan top-level tool calls should never reach this fold. If
//      they do, hiding them is honest — we have nowhere to render them.
//
//   2. tool_result with `toolUseId` not in toolById: dropped. SDK
//      message ordering is assumed to deliver tool_call before its
//      result. Reconnection / replay scenarios that violate this are
//      out of scope for Phase 4.5.
//
//   3. Multiple tool_results for the same toolUseId: blocked is
//      sticky — once a row is blocked, later "error" / "ok" results
//      for the same toolUseId do NOT downgrade it. See the inline
//      comment in the tool_result branch below.
function buildRows(events: NiatoEvent[]): SpecialistRow[] {
  const rows: SpecialistRow[] = [];
  const byId = new Map<string, SpecialistRow>();
  const toolById = new Map<string, ToolRow>();
  for (const e of events) {
    if (e.type === "specialist_dispatched") {
      const row: SpecialistRow = {
        toolUseId: e.toolUseId,
        specialist: e.specialist,
        tools: [],
      };
      rows.push(row);
      byId.set(e.toolUseId, row);
    } else if (e.type === "tool_call") {
      const row: ToolRow = {
        toolUseId: e.toolUseId,
        name: e.toolName,
        inputPreview: e.inputPreview,
        result: undefined,
      };
      toolById.set(e.toolUseId, row);
      const parent =
        e.parentToolUseId !== null ? byId.get(e.parentToolUseId) : undefined;
      if (parent !== undefined) parent.tools.push(row);
    } else if (e.type === "tool_result") {
      const row = toolById.get(e.toolUseId);
      if (row !== undefined) {
        // "blocked" is sticky: once denied by a hook, an error result for
        // the same toolUseId is the underlying call's own failure and
        // must not downgrade the row's status. Otherwise UI users see a
        // refund "succeed" or "error" when it was actually blocked by
        // policy. Hooks-as-enforcement (CLAUDE.md §5) means blocked is
        // load-bearing.
        if (row.result?.outcome === "blocked") {
          // Skip — keep the existing blocked status.
        } else {
          row.result = { outcome: e.outcome, reason: e.reason };
        }
      }
    }
  }
  return rows;
}

function tickFor(
  outcome: "ok" | "error" | "blocked" | undefined,
): React.ReactElement {
  if (outcome === "ok") return <Text color="green">✓</Text>;
  if (outcome === "error") return <Text color="red">✗</Text>;
  if (outcome === "blocked") return <Text color="yellow">⊘</Text>;
  return <Text color="gray">◓</Text>;
}

export function LivePanel({
  events,
  pendingApproval,
  onApprove,
  onDeny,
}: LivePanelProps): React.ReactElement {
  const rows = buildRows(events);
  // Approval keypress handler. Only fires when an approval is pending so
  // 'a' / 'd' are inert during normal operation. Note: this `useInput` is
  // a sibling of TextInput's `useInput` in the parent screen — Ink has no
  // first-capture-wins focus model, so both handlers see every keystroke.
  // While `pendingApproval === undefined` this handler is a no-op and
  // typing flows through to TextInput as expected. Behavior with a
  // pending approval is documented in the session screen.
  useInput((input) => {
    if (pendingApproval === undefined) return;
    if (input === "a" && onApprove !== undefined) {
      onApprove(pendingApproval.approvalId);
    } else if (input === "d" && onDeny !== undefined) {
      onDeny(pendingApproval.approvalId);
    }
  });
  return (
    <Box flexDirection="column">
      {rows.map((row) => (
        <Box key={row.toolUseId} flexDirection="column">
          <Box>
            <Text color="cyan">{`▾ ${row.specialist}`}</Text>
          </Box>
          {row.tools.map((tool, idx) => {
            const isLast = idx === row.tools.length - 1;
            const branch = isLast ? "└─" : "├─";
            return (
              <Box key={tool.toolUseId} flexDirection="column">
                <Box>
                  <Text color="gray">{`  ${branch} `}</Text>
                  {tickFor(tool.result?.outcome)}
                  <Text>{` ${tool.name}`}</Text>
                  <Text color="gray">{` ${tool.inputPreview}`}</Text>
                </Box>
                {tool.result?.outcome === "blocked" &&
                  tool.result.reason !== undefined && (
                    <Box>
                      <Text color="yellow">{`     blocked: ${tool.result.reason}`}</Text>
                    </Box>
                  )}
              </Box>
            );
          })}
        </Box>
      ))}
      {pendingApproval !== undefined && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">
            {`⏸ approval requested: ${pendingApproval.toolName}`}
          </Text>
          <Text color="gray">{`   reason: ${pendingApproval.reason}`}</Text>
          <Text>{`   [a] allow   [d] deny`}</Text>
        </Box>
      )}
    </Box>
  );
}

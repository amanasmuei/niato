import React from "react";
import { Box, Text } from "ink";
import { type NiatoEvent } from "../../../observability/events.js";
import { type ApprovalRequest } from "../../../guardrails/approval-channel.js";

export interface LivePanelProps {
  events: NiatoEvent[];
  pendingApproval: ApprovalRequest | undefined;
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
// under its parent. tool_result events update the matching tool row's
// result field by toolUseId (later events overwrite earlier — Task 1's
// dedupe-by-toolUseId contract for blocked-tool surface duplicates).
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
        row.result = { outcome: e.outcome, reason: e.reason };
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
}: LivePanelProps): React.ReactElement {
  const rows = buildRows(events);
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
              <Box key={tool.toolUseId}>
                <Text color="gray">{`  ${branch} `}</Text>
                {tickFor(tool.result?.outcome)}
                <Text>{` ${tool.name}`}</Text>
                <Text color="gray">{` ${tool.inputPreview}`}</Text>
                {tool.result?.outcome === "blocked" &&
                  tool.result.reason !== undefined && (
                    <Text color="yellow">{`  blocked: ${tool.result.reason}`}</Text>
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

import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  listRecentSessions,
  loadSession,
  type SessionTurnLine,
} from "../store/sessions.js";

export interface HistoryProps {
  sessionsDir: string;
  onBack: () => void;
}

interface HistoryRow {
  sessionId: string;
  ts: string;
  intent: string;
  domain: string;
  confidence: number;
  plan: string;
  costUsd: number;
  latencyMs: number;
  outcome: "success" | "error";
}

interface LoadResult {
  rows: HistoryRow[];
  error: string | undefined;
}

// Default window height when stdout rows are unavailable (e.g. ink-testing-library
// does not always populate `process.stdout.rows`). Matches a comfortable Ink view.
const DEFAULT_TERMINAL_ROWS = 20;
// Reserved chrome rows: title + header + spacer + footer hint + safety margin.
const RESERVED_CHROME_ROWS = 6;
const MIN_WINDOW = 3;

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  // Local-time, short. Avoids locale-dependent date formatting that would
  // make the column width unstable.
  const yyyy = d.getFullYear().toString().padStart(4, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  const hh = d.getHours().toString().padStart(2, "0");
  const mi = d.getMinutes().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function formatLatency(ms: number): string {
  return `${Math.round(ms).toString()}ms`;
}

function outcomeGlyph(outcome: "success" | "error"): string {
  return outcome === "success" ? "✓" : "✗";
}

function loadHistoryRows(sessionsDir: string): LoadResult {
  try {
    const listings = listRecentSessions(sessionsDir);
    const rows: HistoryRow[] = [];
    for (const listing of listings) {
      const session = loadSession(listing.sessionId, sessionsDir);
      if (session === null) continue;
      for (const turn of session.turns) {
        // Only render successful/recorded turns. Error lines lack
        // classification + trace and aren't part of the metrics view.
        if (turn.type !== "turn") continue;
        const t: SessionTurnLine = turn;
        const planArr = t.trace.plan;
        rows.push({
          sessionId: session.sessionId,
          ts: t.ts,
          intent: t.classification?.intent ?? "—",
          domain: t.classification?.domain ?? "—",
          confidence: t.classification?.confidence ?? 0,
          plan: planArr.length > 0 ? planArr.join(", ") : "—",
          costUsd: t.trace.costUsd,
          latencyMs: t.trace.latencyMs,
          outcome: t.trace.outcome,
        });
      }
    }
    // Most recent first across the whole flattened list.
    rows.sort((a, b) => {
      const ta = new Date(a.ts).getTime();
      const tb = new Date(b.ts).getTime();
      return tb - ta;
    });
    return { rows, error: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { rows: [], error: msg };
  }
}

function computeWindowSize(): number {
  const rows = process.stdout.rows;
  const total = typeof rows === "number" && rows > 0 ? rows : DEFAULT_TERMINAL_ROWS;
  const win = total - RESERVED_CHROME_ROWS;
  return win < MIN_WINDOW ? MIN_WINDOW : win;
}

export function History({
  sessionsDir,
  onBack,
}: HistoryProps): React.ReactElement {
  const { rows, error } = useMemo(() => loadHistoryRows(sessionsDir), [
    sessionsDir,
  ]);
  const [cursor, setCursor] = useState<number>(0);
  const windowSize = useMemo(() => computeWindowSize(), []);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
      return;
    }
    if (rows.length === 0) return;
    if (key.upArrow) {
      setCursor((c) => (c > 0 ? c - 1 : c));
    } else if (key.downArrow) {
      setCursor((c) => (c < rows.length - 1 ? c + 1 : c));
    }
  });

  if (error !== undefined) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="cyan">
          History
        </Text>
        <Box marginTop={1}>
          <Text color="red">{`Could not load history: ${error}`}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            esc / q — back
          </Text>
        </Box>
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="cyan">
          History
        </Text>
        <Box marginTop={1}>
          <Text color="gray">No sessions recorded yet</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            esc / q — back
          </Text>
        </Box>
      </Box>
    );
  }

  // Anchor the window so the cursor always sits inside it.
  const half = Math.floor(windowSize / 2);
  let start = cursor - half;
  if (start < 0) start = 0;
  if (start + windowSize > rows.length) {
    start = rows.length - windowSize;
    if (start < 0) start = 0;
  }
  const end = Math.min(rows.length, start + windowSize);

  const visible: { row: HistoryRow; absoluteIndex: number }[] = [];
  for (let i = start; i < end; i++) {
    const r = rows[i];
    if (r === undefined) continue;
    visible.push({ row: r, absoluteIndex: i });
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold color="cyan">
          History
        </Text>
        <Text color="gray">{`  · ${rows.length.toString()} turn${
          rows.length === 1 ? "" : "s"
        }`}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          when                intent · domain · conf  specialists  cost
          latency  ok
        </Text>
      </Box>

      <Box flexDirection="column">
        {visible.map(({ row, absoluteIndex }) => {
          const selected = absoluteIndex === cursor;
          const arrow = selected ? "▸" : " ";
          const confidencePct = `${(row.confidence * 100).toFixed(0)}%`;
          const line = `${arrow} ${formatTimestamp(row.ts)}  ${row.intent} · ${
            row.domain
          } · ${confidencePct}  ${row.plan}  ${formatCost(
            row.costUsd,
          )}  ${formatLatency(row.latencyMs)}  ${outcomeGlyph(row.outcome)}`;
          // Build text props without a literal `color={undefined}` to satisfy
          // exactOptionalPropertyTypes — Ink's `color` rejects `undefined`.
          const textProps: { bold: boolean; color?: string } = {
            bold: selected,
          };
          if (selected) {
            textProps.color = "cyan";
          } else if (row.outcome === "error") {
            textProps.color = "red";
          }
          return (
            <Box key={`${row.sessionId}-${row.ts}-${absoluteIndex.toString()}`}>
              <Text {...textProps}>{line}</Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑/↓ navigate · esc / q — back
        </Text>
      </Box>
    </Box>
  );
}

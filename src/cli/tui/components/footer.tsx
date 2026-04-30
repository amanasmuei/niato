import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { type IntentResult } from "../../../core/classifier/types.js";
import { type TurnRecord } from "../../../observability/trace.js";
import { type SessionPhase } from "../hooks/use-niato-session.js";
import { type SessionMode } from "../store/sessions.js";

// `| undefined` (not bare `?:`) so callers may either omit the prop OR
// pass `undefined` explicitly under `exactOptionalPropertyTypes: true`.
// This matches the shape of `useNiatoSession`'s `classification` and
// `trace` returns, which are `IntentResult | undefined` / `TurnRecord |
// undefined` and would otherwise need a conditional spread at every
// call site.
export interface FooterProps {
  mode: SessionMode;
  phase: SessionPhase;
  classification?: IntentResult | undefined;
  trace?: TurnRecord | undefined;
}

function tickFor(
  active: boolean,
  done: boolean,
  failed: boolean,
): React.ReactElement {
  if (failed) return <Text color="red">✗</Text>;
  if (done) return <Text color="green">✓</Text>;
  if (active)
    return (
      <Text color="yellow">
        <Spinner type="dots" />
      </Text>
    );
  return <Text color="gray">·</Text>;
}

// Always-visible status bar surfacing Niato's "declare before act"
// philosophy: classify → dispatch ticks plus latency/cost. Casual mode
// is one line; dev mode adds the dispatch path on a second line.
export function Footer({
  mode,
  phase,
  classification,
  trace,
}: FooterProps): React.ReactElement {
  if (phase === "idle") {
    return (
      <Box>
        <Text color="gray">· ready</Text>
      </Box>
    );
  }

  const classifyDone = classification !== undefined;
  const classifyActive = phase === "classifying";
  const dispatchDone = phase === "done";
  const dispatchActive = phase === "dispatching";
  const failed = phase === "error";

  return (
    <Box flexDirection="column">
      <Box>
        {tickFor(classifyActive, classifyDone, failed && !classifyDone)}
        <Text>{` classify`}</Text>
        <Text color="gray">{" · "}</Text>
        {tickFor(dispatchActive, dispatchDone, failed && classifyDone)}
        <Text>{` dispatch`}</Text>
        {trace !== undefined && (
          <>
            <Text color="gray">{" · "}</Text>
            <Text color="gray">{`${(trace.latencyMs / 1000).toFixed(1)}s`}</Text>
            <Text color="gray">{` · $${trace.costUsd.toFixed(4)}`}</Text>
          </>
        )}
      </Box>
      {mode === "dev" && trace !== undefined && (
        <Box>
          <Text color="gray">{`  → ${trace.plan.length > 0 ? trace.plan.join(", ") : "(no specialist)"}`}</Text>
        </Box>
      )}
    </Box>
  );
}

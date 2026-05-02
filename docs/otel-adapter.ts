// @ts-nocheck — copy-paste recipe; types resolve when pasted into a
// project that has installed `@opentelemetry/api` and `@aman_asmuei/niato`.
// Niato → OpenTelemetry adapter — copy-paste recipe.
//
// This file is documentation, not bundled code. It is NOT part of the npm
// package's `files` allowlist and is intentionally excluded from the build
// (see tsconfig.build.json's `include`). Drop it into your own service.
//
// Prereqs the user installs in their own project:
//   pnpm add @opentelemetry/api
//   # plus the OTel SDK + exporter that match your deployment, e.g.
//   pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
//
// Datadog: no DD-specific code is needed. Point the OTLP exporter at the
// Datadog Agent's OTel receiver. See docs/otel-adapter.md.

import {
  SpanStatusCode,
  type Attributes,
  type Tracer,
} from "@opentelemetry/api";
import { type TurnRecord } from "@aman_asmuei/niato";

// Maps a single Niato TurnRecord onto a finished OpenTelemetry span.
// The span starts at `trace.startedAt` and ends at startedAt + latencyMs,
// so dashboards line up with the wall-clock turn duration regardless of
// how long the adapter takes to run.
export function niatoToOtelSpan(trace: TurnRecord, tracer: Tracer): void {
  const startMs = Date.parse(trace.startedAt);
  const endMs = startMs + trace.latencyMs;

  const attributes: Attributes = {
    "niato.session_id": trace.sessionId,
    "niato.turn_id": trace.turnId,
    "niato.intent": trace.classification.intent,
    "niato.domain": trace.classification.domain,
    "niato.confidence": trace.classification.confidence,
    "niato.plan": trace.plan.join(","),
    "niato.cost_usd": trace.costUsd,
    "niato.latency_ms": trace.latencyMs,
    "niato.outcome": trace.outcome,
    "niato.guardrails_triggered": trace.guardrailsTriggered.join(","),
  };

  // Per-model token buckets flattened to one attribute each. Use dotted
  // names so OTel backends that index attributes (Honeycomb, Datadog) can
  // facet by model and bucket independently.
  for (const [model, usage] of Object.entries(trace.tokensByModel)) {
    attributes[`niato.tokens.${model}.input`] = usage.inputTokens;
    attributes[`niato.tokens.${model}.output`] = usage.outputTokens;
    attributes[`niato.tokens.${model}.cache_read`] = usage.cacheReadInputTokens;
    attributes[`niato.tokens.${model}.cache_creation`] =
      usage.cacheCreationInputTokens;
  }

  const span = tracer.startSpan("niato.turn", {
    startTime: startMs,
    attributes,
  });

  // One event per dispatched specialist. Keeps the per-turn span flat
  // while preserving the dispatch sequence.
  for (const specialist of trace.specialists) {
    span.addEvent(specialist.name, { tool_calls: specialist.toolCalls });
  }

  if (trace.outcome === "error") {
    span.setStatus({ code: SpanStatusCode.ERROR });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }

  span.end(endMs);
}

// Wires the adapter into Niato's per-turn callback. Call once at startup.
//
//   import { trace } from "@opentelemetry/api";
//   import { createNiato, genericPack } from "@aman_asmuei/niato";
//   import { mountOtelAdapter } from "./otel-adapter.js";
//
//   const tracer = trace.getTracer("niato");
//   const niato = createNiato({
//     packs: [genericPack],
//     onTurnComplete: mountOtelAdapter(tracer),
//   });
export function mountOtelAdapter(
  tracer: Tracer,
): (trace: TurnRecord) => void {
  return (turn) => {
    niatoToOtelSpan(turn, tracer);
  };
}

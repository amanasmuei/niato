# Niato → OpenTelemetry adapter

A **copy-paste recipe** that turns each `TurnRecord` Niato emits into an
OpenTelemetry span. It is **not** an installable adapter — the source lives at
[`docs/otel-adapter.ts`](./otel-adapter.ts), is ~80 lines, and is meant to be
dropped into your own service and edited.

## Why docs and not a package

Niato deliberately does not bundle `@opentelemetry/api`. Tracing setup is
deployment-specific (which exporter, which sampler, which resource attributes),
peer dependencies push install-time cost onto every consumer regardless of
whether they use OTel, and the mapping itself is mechanical — `TurnRecord` is
already the public contract. There is nothing for a package to abstract over.

If you have an existing OTel setup, you only need ~80 lines. If you do not,
the OTel quickstart is below.

## Prerequisites

Install in your service (not in Niato):

```bash
pnpm add @opentelemetry/api
# plus the SDK + exporter that match your deployment:
pnpm add @opentelemetry/sdk-node \
        @opentelemetry/exporter-trace-otlp-http \
        @opentelemetry/auto-instrumentations-node
```

## TurnRecord → OTel span mapping

| `TurnRecord` field          | OTel concept       | Attribute / event name                                   |
| --------------------------- | ------------------ | -------------------------------------------------------- |
| `turnId`                    | span name + attr   | span name = `"niato.turn"`; `niato.turn_id`              |
| `sessionId`                 | span attribute     | `niato.session_id`                                       |
| `startedAt`                 | span start time    | converted from ISO 8601 to ms epoch                      |
| `latencyMs`                 | span duration      | also as `niato.latency_ms` attribute                     |
| `classification.intent`     | span attribute     | `niato.intent`                                           |
| `classification.domain`     | span attribute     | `niato.domain`                                           |
| `classification.confidence` | span attribute     | `niato.confidence` (float)                               |
| `plan`                      | span attribute     | `niato.plan` (comma-joined)                              |
| `costUsd`                   | span attribute     | `niato.cost_usd` (float)                                 |
| `outcome`                   | span attribute + status | `niato.outcome`; `"error"` → `SpanStatusCode.ERROR` |
| `guardrailsTriggered`       | span attribute     | `niato.guardrails_triggered` (comma-joined)              |
| per-model token buckets     | span attributes    | `niato.tokens.<model>.{input,output,cache_read,cache_creation}` |
| each `specialists[i]`       | span event         | event name = specialist name; attrs: `tool_calls`        |

`startedAt` is set as the span's start time so distributed traces align with
real wall-clock instants, not the moment the adapter happened to run.

## Wiring it in

Drop in alongside an existing OTel-instrumented service:

```ts
import { trace } from "@opentelemetry/api";
import { createNiato, genericPack } from "@aman_asmuei/niato";
import { mountOtelAdapter } from "./otel-adapter.js";

const tracer = trace.getTracer("niato");

const niato = createNiato({
  packs: [genericPack],
  onTurnComplete: mountOtelAdapter(tracer),
});
```

`onTurnComplete` errors are caught and logged at `warn` level by Niato — the
adapter cannot break user flows.

## Quickstart with `@opentelemetry/sdk-node`

For a service that does not yet have OTel:

```ts
// otel-init.ts — imported FIRST, before anything else.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "niato-service",
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318/v1/traces",
  }),
});

sdk.start();

process.on("SIGTERM", () => {
  void sdk.shutdown();
});
```

```ts
// app.ts
import "./otel-init.js"; // MUST be the first import
import { trace } from "@opentelemetry/api";
import { createNiato, genericPack } from "@aman_asmuei/niato";
import { mountOtelAdapter } from "./otel-adapter.js";

const niato = createNiato({
  packs: [genericPack],
  onTurnComplete: mountOtelAdapter(trace.getTracer("niato")),
});
```

## Datadog

There is **no Datadog-specific code**. Datadog's Agent has a
[built-in OTLP receiver](https://docs.datadoghq.com/opentelemetry/setup/otlp_ingest_in_the_agent/);
point the OTLP exporter at it and Datadog will ingest the spans natively.

```bash
# In your Datadog Agent config (datadog.yaml):
otlp_config:
  receiver:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

# Then your service exports to:
OTEL_EXPORTER_OTLP_ENDPOINT=http://datadog-agent:4318
```

The `niato.*` span attributes become Datadog tags automatically. APM service
name comes from the `service.name` resource attribute — set it via
`OTEL_RESOURCE_ATTRIBUTES=service.name=niato-service` or in `resourceFromAttributes`
above.

## Honeycomb / Tempo / Jaeger / your own backend

Same code. Swap the OTLP exporter URL (and headers, if your backend needs an
API key) and you are done. The `niato.*` attribute namespace is generic
OpenTelemetry — every OTLP-compatible backend will index it.

## Customizing

The adapter is intentionally short. Common edits:

- **Sample at the adapter layer.** Skip cheap turns: `if (trace.costUsd < 0.001) return;`
- **Attach session-level resource attributes.** If you carry tenant / user IDs
  in `TurnRecord.classification` (a custom intent shape) or in your own
  external context, fold them in before `tracer.startSpan`.
- **Emit a metric alongside the span.** `costUsd` and `latencyMs` are good
  candidates — use `@opentelemetry/api`'s `metrics` API in `mountOtelAdapter`.
- **Suppress error stacks.** The current adapter only sets the span status to
  `ERROR` for `outcome === "error"`. If you start surfacing exception details
  in `TurnRecord` later, add `span.recordException(...)` here.

## What the adapter does NOT do

- It does not initialize the OTel SDK. That is your service's bootstrap concern.
- It does not handle batch shutdown. Use the OTel SDK's `shutdown()` in your
  process termination handler.
- It does not propagate span context across turns or sessions. Every turn is
  one span, parentless. If you want a session-spanning parent span, wrap your
  call to `niato.run()` in a `tracer.startActiveSpan(...)` block in your own
  code — the adapter will then automatically attach to it via the active context.

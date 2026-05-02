# Niato — architecture

> *Niato* — derived from *niat* (Malay/Indonesian for *"intention"*, from the Arabic root نِيَّة). The formal declaration of intent before an act.
>
> A production-grade intent-routing agent built on the **Claude Agent SDK**, in **TypeScript**, designed around a **shared core + pluggable Domain Packs**. The system declares what it's about to do, then does it — the same pattern enforced at every layer: classify, plan, approve, act.

**Status.** Phases 1–10 shipped (see [README roadmap](./README.md#roadmap)). The architecture below remains the source of truth for design decisions; the README is the source of truth for shipped behavior. When the two disagree, the README wins until this doc catches up.

---

## 1. Goals and non-goals

**Goals**

- Classify user intent reliably and dispatch to the right specialist.
- Support multiple domains (support, dev tools, generic) through a single composable abstraction.
- Keep specialist context windows small and focused.
- Make every action auditable, reversible where possible, and gated for high-stakes operations.
- Run in production: rate limits, retries, session resumption, sandboxing, observability.
- Be cost-efficient: Haiku for classification, Opus for orchestration, Sonnet for specialists.

**Non-goals**

- A general-purpose AGI loop. This is an intent router with execution.
- Multi-model brokerage (Claude + GPT + local). Add an adapter layer if needed; out of scope.
- A no-code platform. Code-first SDK architecture.

---

## 2. Language and runtime

**TypeScript (Node 20+).** Reasons specific to this architecture:

- The TS Agent SDK bundles a native Claude Code binary as an optional dependency. Deployment is `npm install` with no separate Claude Code install step.
- This architecture passes structured payloads across many layers (`IntentResult`, `AgentDefinition`, hook events, MCP tool schemas). Strong typing surfaces contract violations at compile time.
- Streaming and async control flow are native idioms.
- Production observability tooling (OpenTelemetry, Datadog, Sentry) is mature for Node.

The Python SDK is fully equivalent in capability. Pick Python if your team's center of gravity is ML/data engineering — this architecture maps cleanly to either.

**Pinned versions** (verify at install):

- `@anthropic-ai/claude-agent-sdk` — minimum 0.2.111 for Opus 4.7 support
- `@modelcontextprotocol/sdk` — for custom MCP servers
- `zod` — runtime schema validation at trust boundaries

---

## 3. System layers

**Seven runtime layers** plus **three cross-cutting foundations**.

### Runtime layers (request lifecycle)

| # | Layer | Responsibility |
|---|---|---|
| 1 | Ingress | Auth, rate limit, idempotency, payload normalization |
| 2 | Session and input handling | Resume conversation, load user context |
| 3 | Intent classifier | Map raw input to `{intent, domain, entities, urgency, confidence}` |
| 4 | Orchestrator | Plan, dispatch specialists, aggregate results, decide next step |
| 5 | Domain packs | Pluggable bundles of specialists + MCP + skills per domain |
| 6 | Tools and MCP | Built-in SDK tools, custom in-process tools, external MCP servers |
| 7 | Response synthesis | Compose final user-facing message, attach citations, persist transcript |

### Cross-cutting foundations

| Foundation | Purpose |
|---|---|
| Memory and state | Session memory, long-term key-value store, Agent Skills |
| Guardrails | Permission policies, pre/post tool hooks, input/output validators |
| Observability | Distributed tracing, token and cost accounting, eval suite |

---

## 4. Two-stage routing — *the declaration*

A common mistake is letting the orchestrator do classification *and* planning in one call. That's expensive — Opus burns tokens on triage Haiku could do in 50ms.

```
raw user input
   │
   ▼
[Haiku classifier]  ──►  { intent, domain, entities, urgency, confidence }
   │
   ▼
[Opus orchestrator] ◄── reads classification, picks pack, dispatches specialist
```

This is Niato's first declaration: the classifier states the intent before any action is taken.

Confidence policy:

- `confidence >= 0.85` → dispatch directly.
- `0.6 <= confidence < 0.85` → orchestrator may dispatch with a verification step or ask one clarifier.
- `confidence < 0.6` → orchestrator asks user a clarifying question; do not dispatch.

The classifier is **out-of-band**. It is not exposed to the orchestrator as a tool — that would burn tokens deciding when to call it.

---

## 5. Orchestrator — *the planner*

The orchestrator is the only component that runs the full Agent SDK loop. It does not do work — it coordinates.

```ts
const orchestratorOptions: ClaudeAgentOptions = {
  model: "claude-opus-4-7",
  systemPrompt: ORCHESTRATOR_PROMPT,
  allowedTools: ["Agent"],          // can ONLY dispatch specialists
  agents: mergePackAgents(packs),   // assembled from loaded domain packs
  hooks: globalHooks,
  settingSources: [],               // don't auto-load .claude/ unless intentional
};
```

Routing invariants the orchestrator enforces:

1. The orchestrator never has Read, Write, Edit, or Bash. Restricting it to `Agent` keeps the coordinator/worker boundary stable. If you give it execution tools, it will use them, and the architecture decays.
2. Multi-pack requests dispatch sequentially when there's data dependency, in parallel when independent. The orchestrator decides at plan time.
3. After every specialist returns, the orchestrator decides: respond, dispatch another, or ask the user a clarifier.
4. Any specialist returning a `requires_human_approval` payload halts the loop until the approval hook resolves.

This is Niato's second declaration: the orchestrator states the plan before executing it.

---

## 6. Domain pack abstraction

A **Domain Pack** is a self-contained bundle that plugs into the shared core.

```ts
export interface DomainPack {
  name: string;                       // e.g., "support", "dev-tools", "generic"
  description: string;                // injected into classifier prompt for routing

  intents: IntentDefinition[];        // pack-specific intents (e.g., "refund_request")
  agents: Record<string, AgentDefinition>;  // specialist subagents

  mcpServers?: McpServerConfig[];     // external integrations
  inProcessTools?: McpServer[];       // custom tools via createSdkMcpServer
  skills?: string[];                  // paths to .claude/skills/<skill>/SKILL.md

  hooks?: PackHooks;                  // pack-specific pre/post hooks
  route(intent: IntentResult): string | null;  // intent → specialist name
}
```

### Composition rules

- The Core loads one or more packs at startup.
- Each pack contributes its intents to the classifier's prompt vocabulary. The orchestrator's `agents` map is the union of all pack agents, namespaced by pack (`support.ticket_lookup`, `dev_tools.codebase_search`).
- A request is routed by `(domain, intent)`: the classifier returns both, the orchestrator picks the pack from `domain`, then calls `pack.route(intent)` to pick the specialist.
- Packs share the global hooks but can register additional pack-scoped hooks (e.g., the support pack adds a PII-redaction hook to all its specialist tools).
- Packs ship with their own evals. The pack interface exposes a `runEvals()` method consumed by CI.

### Why a pack abstraction at all

Without it, you end up with a single sprawling `agents` map, a single sprawling system prompt, and a single eval suite that tests everything at once. With it:

- Teams own packs end to end. Support team owns the Support pack's prompts, MCP credentials, and evals.
- Packs are versioned independently. Bumping the Support pack from `1.4.0` to `1.5.0` does not require re-running Dev Tools evals.
- The classifier prompt stays scoped: it sees only the descriptions of loaded packs, not every possible intent across the company.
- New domains ship as new packs, not as PRs to a monolithic agent.

---

## 7. Reference domain packs

### 7.1 Generic pack (baseline, always available)

The minimum viable pack. Useful as a fallback when no other domain matches and as a building block.

```ts
export const genericPack: DomainPack = {
  name: "generic",
  description: "General-purpose questions and tasks not covered by a specialized pack.",
  intents: [
    { name: "question", description: "User asks for information or explanation" },
    { name: "task",     description: "User asks for a concrete action or transformation" },
    { name: "escalate", description: "User asks for a human" },
  ],
  agents: {
    retrieval: {
      description: "Read-only research and Q&A.",
      prompt: GENERIC_RETRIEVAL_PROMPT,
      tools: ["Read", "Grep", "Glob", "WebSearch", "WebFetch"],
      model: "claude-sonnet-4-6",
    },
    action: {
      description: "Performs reversible actions and transformations.",
      prompt: GENERIC_ACTION_PROMPT,
      tools: ["Read", "Write", "Edit", "Bash"],
      model: "claude-sonnet-4-6",
    },
    escalate: {
      description: "Hands off to a human.",
      prompt: GENERIC_ESCALATE_PROMPT,
      tools: [],
      model: "claude-sonnet-4-6",
    },
  },
  route: (intent) => ({
    question: "retrieval",
    task: "action",
    escalate: "escalate",
  }[intent.intent] ?? null),
};
```

### 7.2 Support pack

Customer support / helpdesk workflows. Read-write to ticketing, billing, and CRM systems.

```ts
export const supportPack: DomainPack = {
  name: "support",
  description: "Customer support: order status, refunds, complaints, account questions.",
  intents: [
    { name: "order_status",     description: "User asks about an order or shipment" },
    { name: "refund_request",   description: "User wants a refund" },
    { name: "billing_question", description: "User has a question about charges" },
    { name: "complaint",        description: "User expresses dissatisfaction" },
    { name: "account_help",     description: "User needs help with their account" },
  ],
  agents: {
    ticket_lookup:    /* read-only: tickets MCP, KB MCP */ {},
    refund_processor: /* writes: Stripe MCP, audit log; gated by approval hook */ {},
    kb_search:        /* read-only: vector store / docs MCP */ {},
    escalate:         /* creates priority ticket, pages on-call */ {},
  },
  mcpServers: [
    { url: "https://mcp.zendesk.com/sse", credentialId: "vault://support/zendesk" },
    { url: "https://mcp.stripe.com/sse",  credentialId: "vault://support/stripe" },
  ],
  skills: [
    ".claude/skills/brand-voice/SKILL.md",
    ".claude/skills/refund-policy/SKILL.md",
    ".claude/skills/escalation-rules/SKILL.md",
  ],
  hooks: {
    preToolUse: [piiRedactionHook, refundApprovalGate, dollarLimitHook],
  },
  route: (intent) => ({
    order_status:     "ticket_lookup",
    refund_request:   "refund_processor",
    billing_question: "kb_search",
    account_help:     "kb_search",
    complaint:        "escalate",
  }[intent.intent] ?? null),
};
```

Notable design choices:

- `refund_processor` lives behind an approval hook keyed on dollar amount. Refunds under $20 auto-approve; anything higher pages a human.
- `escalate` does not just hand off — it creates a structured ticket with the conversation summary and pages on-call if severity is high.
- `kb_search` and `ticket_lookup` are separate specialists even though both are read-only. Different prompts, different tools, different evals. Splitting them keeps each specialist's context tight.

### 7.3 Dev tools pack

Internal developer assistant. Code Q&A, PR creation, CI debugging.

```ts
export const devToolsPack: DomainPack = {
  name: "dev_tools",
  description: "Engineering tasks: code search, explanation, PRs, CI debugging.",
  intents: [
    { name: "find_code",    description: "Locate code matching a description" },
    { name: "explain_code", description: "Explain how a piece of code works" },
    { name: "fix_bug",      description: "Diagnose or fix a bug" },
    { name: "create_pr",    description: "Open a pull request" },
    { name: "debug_ci",     description: "Investigate a CI failure" },
  ],
  agents: {
    codebase_search: /* read-only: Read, Grep, Glob, GitHub MCP */ {},
    code_explainer:  /* read-only: Read, Grep + skill: code-conventions */ {},
    bug_fixer:       /* writes: Read, Edit, Bash (tests only) + GitHub MCP */ {},
    pr_creator:      /* writes via GitHub MCP; gated by approval for protected branches */ {},
    ci_debugger:     /* read-only: GitHub Actions MCP, log fetcher */ {},
  },
  mcpServers: [
    { url: "https://mcp.github.com/mcp", credentialId: "vault://dev/github" },
    { url: "https://mcp.linear.app/mcp", credentialId: "vault://dev/linear" },
  ],
  skills: [
    ".claude/skills/code-conventions/SKILL.md",
    ".claude/skills/pr-template/SKILL.md",
    ".claude/skills/test-strategy/SKILL.md",
  ],
  hooks: {
    preToolUse: [protectedBranchGate, sandboxBashHook, secretsScanHook],
  },
  route: (intent) => ({
    find_code:    "codebase_search",
    explain_code: "code_explainer",
    fix_bug:      "bug_fixer",
    create_pr:    "pr_creator",
    debug_ci:     "ci_debugger",
  }[intent.intent] ?? null),
};
```

Notable design choices:

- `bug_fixer`'s `Bash` tool is restricted by hook to running tests only (`npm test`, `pytest`). Anything else is blocked.
- `pr_creator` is gated by the protected-branch hook — opening a PR against `main` requires a human approval.
- The code-conventions skill is loaded into every specialist's context so all output follows the same style.

### 7.4 Composing multiple packs

A real Niato deployment will likely run multiple packs simultaneously. Example: an internal assistant that handles both engineering questions and support escalations from inside Slack.

```ts
const agent = createNiato({
  packs: [genericPack, supportPack, devToolsPack],
  globalHooks: [authzHook, costLimitHook, observabilityHook],
  observability: { tracer, metrics, costTracker },
});
```

Cross-pack dispatch is allowed and expected. A request like *"the refund webhook is broken — find the bug and open a ticket for the on-call engineer"* routes as:

1. Classifier returns `{ domains: ["dev_tools", "support"], intents: ["fix_bug", "complaint"], ... }`.
2. Orchestrator dispatches `dev_tools.bug_fixer` first (it produces context the next step needs).
3. Orchestrator passes the bug summary to `support.escalate`, which creates the ticket.
4. Orchestrator synthesizes a response citing both.

The classifier may return an array of (domain, intent) pairs when input genuinely spans domains. When unsure, the orchestrator asks for clarification rather than guessing.

---

## 8. Tools and MCP

Three sources, in priority order:

1. **Built-in SDK tools** — `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, `Agent`. Battle-tested. Always start here.
2. **In-process custom tools** via `createSdkMcpServer`. Use when a function is faster called in-process than over the network — typical case is a wrapper around your internal database client.
3. **External MCP servers** for third-party integrations. Credentials live in a vault, never in the system prompt.

### Tool design principles

- Capabilities, not tasks. `read_file(path)` is reusable; `read_quarterly_report()` is not.
- Structured, parseable output (JSON or stable text).
- Idempotent where possible. Mandatory client-supplied idempotency keys for any tool that mutates external state.
- Small surface area per specialist. A specialist with 30 tools makes worse decisions than one with 5.

---

## 9. Memory and state

Three tiers, three lifetimes.

| Tier | Lifetime | Storage | Loaded by |
|---|---|---|---|
| Conversation | Per session | SDK-managed; persist transcript by `session_id` | Auto by SDK; manual on resume |
| Long-term | Per user, durable | Key-value store (Redis, DynamoDB, Postgres) | Session loader injects relevant slice into orchestrator prompt |
| Domain knowledge | Versioned with code | Markdown files in `.claude/skills/<skill>/SKILL.md` | Listed explicitly per pack and per specialist |

The SDK's `compact` feature auto-summarizes prior messages when the context window approaches limit. Don't reinvent it. Practitioners report best results from rewriting (not appending) a short session summary at end-of-turn — the SDK's compact does this for you.

**v1.x long-term memory implementation note.** v1.x ships the durable tier as a deliberately simpler shape than the table above suggests: a free-form `facts: string[]` written to JSON files at `~/.niato/memory/<userId>.json`, plus a thin two-method `MemoryStore` interface (`read` + `write`). The default `FileMemoryStore` is what `createNiato({ memory: {} })` selects out of the box. Pluggable adapters remain the future shape — Redis / DynamoDB / Postgres backends drop in by implementing the same interface, no core changes. Structured KV and auto-extraction land in v1.1.

Memory injects only into the orchestrator's system prompt — never into specialists. ARCHITECTURE invariant #4 (subagents don't inherit parent context) keeps that boundary clean: anything a specialist needs is passed via the `Agent` tool's `prompt` arg by the orchestrator at runtime.

Subagents don't inherit parent skills. Each pack lists which skills its specialists need.

---

## 10. Guardrails — *the gate before action*

Defense in depth: permissions, hooks, validators. Together these are Niato's third declaration: the gate that says *"this is what I'm about to do — confirm before I proceed."*

### Permission policies

- `default` — Claude asks before destructive operations.
- `acceptEdits` — auto-approves edits, asks for shell.
- `bypassPermissions` — only acceptable inside a hardened sandbox.
- `plan` — proposes a plan first; nothing executes until approved.

For high-stakes packs (Support's refund processor, Dev Tools' PR creator), prefer `default` plus an approval hook.

### Hooks as enforcement boundaries

Hooks are *enforcement*, not logging. Every pack that does writes registers at least these:

- **`preToolUse`** — block tool invocations failing pack policy. Used for: path allowlists, dollar limits, dangerous-command blocklists, branch protection, human approval.
- **`postToolUse`** — record what changed, scan for secret leakage, compute audit hash.
- **`stop`** — final pass over the response before returning to the user.

Hooks are simple typed functions that return `{ action: "allow" | "block", reason?: string }`. Reasons surface to the agent so it can replan.

### Validators

- **Input** — strip prompt-injection patterns, enforce max length, classify abuse before the classifier runs.
- **Output** — scan final response for secrets, internal hostnames, PII.

Validators are regex/classifier passes. Keep them out of the agent loop where they'd consume tokens.

---

## 11. Observability

Production agents fail silently without telemetry. Instrument from day one.

### Per-turn record

```jsonc
{
  "session_id": "...",
  "turn_id": "...",
  "user_id": "...",
  "classification": {
    "intent": "refund_request",
    "domain": "support",
    "confidence": 0.94,
    "entities": { "order_id": "..." }
  },
  "plan": ["support.refund_processor"],
  "specialists": [
    {
      "name": "support.refund_processor",
      "tool_calls": [
        { "tool": "mcp__stripe__refund", "ok": true, "duration_ms": 412 }
      ],
      "tokens": { "in": 8400, "out": 720, "model": "claude-sonnet-4-6" }
    }
  ],
  "tokens_total": { "haiku": 410, "opus": 4580, "sonnet": 9120 },
  "cost_usd": 0.13,
  "latency_ms": 3210,
  "outcome": "success",
  "guardrails_triggered": []
}
```

### Eval suite

Per-pack golden test set of 100–500 inputs labeled with expected `(domain, intent)` and, where applicable, expected tool calls and final answer shape. CI runs the relevant pack's evals on every change to that pack. Bumping the orchestrator or the classifier reruns all packs.

Score with: exact-match for `(domain, intent)`, an LLM-judge for free-form answers, structural assertions for tool-call sequences.

---

## 12. Cost and latency model

Approximate per-turn cost (verify against current pricing):

| Stage | Model | Notes |
|---|---|---|
| Classify | Haiku 4.5 | very low; cache the system prompt |
| Plan | Opus 4.7 | medium; cache the orchestrator system prompt |
| Specialist | Sonnet 4.6 | low–medium per call; tool round-trips dominate |

Levers:

- Prompt caching on the orchestrator system prompt (hit rate 80%+ on warm sessions).
- Use Haiku for the classifier even at scale — the savings compound.
- Avoid loading whole files when grep would suffice.
- Set `CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-4-6` if you want a global default for all subagents.

---

## 13. Repository layout

```
niato/
├── src/
│   ├── core/
│   │   ├── ingress.ts                  # auth, rate limit, idempotency
│   │   ├── session.ts                  # session resume, long-term memory loader
│   │   ├── classifier/
│   │   │   ├── prompt.ts
│   │   │   └── classify.ts             # Haiku call, returns IntentResult
│   │   ├── orchestrator/
│   │   │   ├── prompt.ts
│   │   │   └── orchestrator.ts         # main Agent SDK loop, dispatches specialists
│   │   └── compose.ts                  # createNiato({ packs, hooks, ... })
│   │
│   ├── packs/
│   │   ├── DomainPack.ts               # interface
│   │   ├── generic/
│   │   │   ├── pack.ts
│   │   │   ├── prompts/
│   │   │   └── evals/
│   │   ├── support/
│   │   │   ├── pack.ts
│   │   │   ├── prompts/
│   │   │   ├── hooks.ts                # PII redaction, refund approval, dollar limits
│   │   │   └── evals/
│   │   └── dev-tools/
│   │       ├── pack.ts
│   │       ├── prompts/
│   │       ├── hooks.ts                # protected branch, sandbox bash, secrets scan
│   │       └── evals/
│   │
│   ├── tools/
│   │   ├── builtin.ts                  # tool allowlists per agent
│   │   └── mcp/                        # custom in-process MCP servers
│   │
│   ├── memory/
│   │   ├── session-store.ts
│   │   ├── long-term.ts
│   │   └── skills-loader.ts
│   │
│   ├── guardrails/
│   │   ├── hooks/                      # global hooks
│   │   ├── permissions.ts
│   │   └── validators.ts
│   │
│   ├── observability/
│   │   ├── tracing.ts
│   │   ├── metrics.ts
│   │   └── cost.ts
│   │
│   └── index.ts
│
├── .claude/
│   ├── skills/                         # markdown skill files referenced by packs
│   │   ├── brand-voice/
│   │   ├── refund-policy/
│   │   ├── code-conventions/
│   │   └── pr-template/
│   └── settings.json
│
├── evals/
│   ├── runner.ts                       # invokes each pack's runEvals()
│   └── reports/
│
├── tests/
└── package.json
```

Conventions:

- Entry-point factory is `createNiato(...)`. The package is published as `niato`.
- One file per `AgentDefinition`. Prompts live in adjacent `.md` files when over ~30 lines.
- All prompts versioned in git. Never load from a database at runtime.
- All MCP URLs and credentials referenced via env vars or vault paths. No literals in code.
- Each pack exposes a single default export of type `DomainPack`. The Core never imports specifics from inside a pack — only the pack's public interface.

---

## 14. Deployment

- **Sandboxing.** Run tool execution (especially `Bash`) in a sandbox even for internal agents. Anthropic's Managed Agents (April 2026 GA) provides per-session containers if you want to outsource the sandbox layer.
- **Credentials.** Vault-based (HashiCorp Vault, AWS Secrets Manager, or Anthropic vault on Managed Agents). Never put OAuth tokens in system prompts.
- **Resource limits.** Per-session token budgets and wall-clock timeouts. Agents will burn through context if uncapped.
- **Model pinning.** Pin `claude-opus-4-7`, not `claude-opus-latest`. Bump intentionally with eval verification.
- **Pack rollout.** Each pack ships behind a feature flag at first. The flag controls whether the Core loads the pack at startup.

---

## 15. Implementation phases

This is the rollout I'd recommend when you decide to start coding. Each phase ends with something demoable.

**Phase 1 — Skeleton.** Core engine + Generic pack only. The classifier returns a hardcoded intent. The orchestrator dispatches to the Generic retrieval agent. End-to-end loop works.

**Phase 2 — Real classifier.** Replace the stub with the real Haiku classifier. Add 20 golden test cases for the Generic pack. Add basic tracing.

**Phase 3 — Hooks and guardrails.** Wire up the global hook framework. Add input validators. Add cost-limit hook.

**Phase 4 — First domain pack.** Ship one real pack (Support or Dev Tools, whichever is higher value) end to end with its own MCP, skills, prompts, and evals. Run in production behind a feature flag.

**Phase 5 — Second domain pack.** Validate the pack abstraction by adding the second one. Most issues with the abstraction surface here.

**Phase 6 — Cross-pack composition.** Enable multi-pack requests. Test thoroughly — this is where regressions hide.

**Phase 7 — Observability hardening.** Per-pack dashboards, cost alerts, regression alerting on eval drops.

Resist the urge to spin up a fourth pack before the first three are stable. Pack sprawl is the most common reason these systems become unmaintainable.

---

## 16. What Niato is not

- Not a single mega-agent. Those degrade fast as scope grows.
- Not a peer-to-peer agent team. Teams shine for many parallel independent tasks (50 ticket triages); Niato is a sequential intent router with composition.
- Not a chatbot. A chatbot replies; Niato acts.
- Not a one-pack monolith. The pack abstraction is the core idea — using it for a single pack still pays for itself in testability.

---

## 17. About the name

**Niato** is derived from *niat* — the Malay/Indonesian word for *"intention"*, sharing its Arabic root نِيَّة (niyya) with the Indonesian/Malay tradition of declaring intent before an act. The name captures the design philosophy of this system: every meaningful action is preceded by a stated intent. The classifier declares the intent. The orchestrator declares the plan. The guardrails declare what's about to happen. Then, and only then, the system acts.

The whole architecture is a series of declarations before actions.

---

## 18. Open questions to resolve before coding

These are decisions that should be made before scaffolding, not during:

1. **Hosting model.** Self-hosted Node service vs Anthropic Managed Agents? Affects sandboxing, credential storage, and observability integration.
2. **Session storage.** Redis (fast, in-memory) vs Postgres (durable, queryable) vs both?
3. **MCP server hosting.** Anthropic-hosted partner MCPs where available, vs running our own?
4. **Pack ownership model.** One team owns all packs vs distributed ownership? Affects CI/release pipeline design.
5. **Eval cadence.** On every commit, on PR merge, nightly? Affects compute budget for evals.
6. **Failure mode for the classifier.** If Haiku is down, fall back to a regex classifier, fall back to "always ask for clarification", or fail closed?

# Niato — Phase 1 kickoff prompt for Claude Code

Paste the block below into Claude Code (in a fresh empty directory containing `ARCHITECTURE.md` and `CLAUDE.md`) to start the build.

---

## The prompt

```
I'm building Niato — an intent-routing agent on the Claude Agent SDK in TypeScript. The name is Arabic for "I have intended" and reflects the design: declare intent before acting at every layer.

The full architecture is in ARCHITECTURE.md and the project conventions are in CLAUDE.md — read both before doing anything.

We're starting Phase 1 from §15 of the architecture: the skeleton. Scope:

1. Project setup — pnpm, TypeScript strict mode, vitest, eslint with the @typescript-eslint/recommended-strict ruleset, the directory layout from §13. Package name: "niato".
2. Core types — DomainPack interface, IntentResult, AgentDefinition wrapper, hook event shapes. Use zod for runtime validation at trust boundaries.
3. Stub classifier — returns a hardcoded { intent: "question", domain: "generic", confidence: 0.95 } for every input. Real Haiku call comes in Phase 2.
4. Orchestrator — wires up the Agent SDK with allowedTools restricted to ["Agent"], settingSources: [], and a system prompt that enforces the routing invariants from §5.
5. Generic pack — minimum viable: retrieval, action, escalate specialists per §7.1. Use the built-in SDK tools only; no MCP servers yet.
6. Entry point — export createNiato({ packs, hooks, ... }) from src/index.ts.
7. End-to-end smoke test — a single test that sends "what is 2+2" through the full loop and asserts the retrieval specialist runs.
8. README — one-paragraph project description (include the meaning of "Niato"), "how to run" section, and a link to ARCHITECTURE.md.

Constraints:
- TypeScript strict, no `any`, no `as` casts unless commented.
- Pin @anthropic-ai/claude-agent-sdk to ^0.2.111 or whatever the latest stable is — check first.
- One AgentDefinition per file. Prompts go in adjacent .md files when over 30 lines.
- No prompts loaded from a database. Everything in git.
- All env vars referenced through a single typed config module that fails fast at startup.

Process:
- Use plan mode. Show me the plan before touching files.
- After I approve, work through the plan step by step, committing after each meaningful chunk.
- After each step, briefly summarize what you did and what's next. Don't ask permission for every small thing — group small edits.
- If you find yourself making a non-trivial design choice that's not in ARCHITECTURE.md, stop and ask.
- Run `pnpm typecheck && pnpm test` before declaring a step done.

What to skip in Phase 1:
- Real classifier (stub it).
- Hooks framework (placeholder interfaces only).
- MCP servers.
- Memory layer beyond an in-memory session map.
- Observability beyond console logging.
- Support and Dev Tools packs.

Start by reading ARCHITECTURE.md and CLAUDE.md, then propose the plan.
```

---

## How to use it

1. Drop `ARCHITECTURE.md` and `CLAUDE.md` into an empty directory called `niato/`.
2. `git init && git add . && git commit -m "architecture and conventions"`
3. Open Claude Code in that directory: `claude` from the terminal.
4. Paste the prompt above.
5. Claude Code will read both docs, propose a plan, and wait. Approve or push back.
6. After plan approval, it works through the steps. You watch, intervene, course-correct.

## Why the prompt is shaped this way

**Plan mode first.** Claude Code's `plan` permission mode is the right gate for greenfield work. Forces a "show me first" step before any file is created — which is itself a Niato pattern.

**Read the docs before acting.** Without this line, Claude Code might start scaffolding from its own priors. The doc is the spec; we want the doc to be authoritative.

**Phase scoping.** Phase 1 only. Resist the urge to ask for "the whole thing." A 200-file dump from a single prompt produces worse code than four 50-file iterations with checkpoints in between.

**Constraints listed concretely.** "TypeScript strict" is a rule. "Write good code" is a wish. The model follows rules.

**"Skip" list explicit.** Naming what's NOT in scope is more important than naming what is. Otherwise Claude Code helpfully scaffolds the entire architecture and you spend an hour deleting things.

**Stop-and-ask trigger.** "If you're making a design choice not in the doc, ask." This is the single most valuable line in the prompt. It catches drift before it compounds.

**Commit after each chunk.** Gives you a clean revert point if a step goes sideways.

---

## Subsequent phase prompts

When Phase 1 ships and is committed, write a similar prompt for Phase 2 (real Haiku classifier + first 20 golden eval cases) and paste it into the same Claude Code session. The pattern repeats: prompt, plan, approve, execute, commit.

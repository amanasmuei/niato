# End-User TUI — Design Spec

**Date:** 2026-04-28
**Status:** Approved (brainstorm), pending implementation plan
**Owner:** Aman
**Tracking:** v1 ship target — public release

---

## Goal

Ship a polished, public-facing terminal UI for Nawaitu that serves **both** developer
workflows (building/inspecting intent-routing agents) and personal-companion
workflows (chatting with a faith-aware AI partner) — in one cohesive app, with mode
selected per session.

The TUI must surface Nawaitu's "declare before act" philosophy as a first-class UI
property: classification, dispatch, and cost are visible by default, never hidden.

## Non-goals (v1)

- Long-term cross-session memory (Level 3 work, deferred to v1.x).
- History browser UI (folded into "Resume last" in v1).
- In-TUI eval runner (CLI-only via `pnpm eval` for v1).
- Pack inspector UI (deferred — README-only for v1).
- Single-binary distribution (npm-only for v1; binary + Homebrew in v1.1).
- Mobile / Termux optimization (works there, but not a target).

---

## Audience & framing

| Persona | What they want | What v1 gives them |
| --- | --- | --- |
| **Developer building agents** | Observability, reproducibility, fast iteration | Dev mode: full footer (phase + cost + tokens), pack-pinned defaults |
| **Faith-aware companion user** | Warmth, voice, low-friction chat | Casual mode: thin footer, companion persona, gentle pacing |

One TUI, one brand identity. Mode is **chosen per session**, not at launch — the
launcher is mode-agnostic.

---

## User-facing decisions (all approved)

| ID | Decision | Choice |
|----|----------|--------|
| Q1 | Audience | **Both** — single TUI serves devs and end users |
| Q2 | Mode coexistence | **Per-session pick** at session start (`c`asual / `d`ev) |
| Q3 | Launcher scope | **Lean** — New session · Resume last · Settings · About |
| Q4 | Session layout | **Chat + thin always-visible footer** |
| Q5 | Auth | OAuth (Claude subscription, recommended) **or** API key |
| Q5 | Install | `npm i -g nawaitu` (v1); single-binary + Homebrew in v1.1 |
| Q5 | Persistence | JSONL session files at `~/.nawaitu/sessions/{id}.jsonl`, last 50 retained |

---

## Implementation approach

**Approach 2 — screen-per-file with a tiny custom router**, no new runtime
dependencies. Reuses existing Ink + ink-spinner. Adds `ink-testing-library` as a
single dev dependency.

Existing CLI entry points (`cli.ts`, `cli-chat.ts`, `cli-multi.ts`, `cli-tui.tsx`,
`cli-login.ts`) remain functional during transition. `cli-tui.tsx` retires in
the release **after** v1 ships (its single-turn role is fully subsumed by the
new `session.tsx` screen).

---

## §1. Architecture

### Entry-point routing

`bin/nawaitu` decides between TUI and headless modes:

- **Interactive TTY + no positional args** → launches TUI (`src/cli/tui/index.tsx`).
- **Args provided OR stdin piped** → falls through to existing single-shot
  `cli.ts` behavior. `echo "hi" | nawaitu` and `nawaitu "hi"` keep working.

This preserves scripting use cases and avoids breaking anyone already piping
into the binary.

### Shell shape

```
<App>
  <Screen />              ← swappable: launcher | session | settings | about | first-run
  {inSession && <Footer />}
</App>
```

Screen state managed by `useScreenStack` hook (`push`, `pop`, `replace`,
`current`). No global store in v1 — props at push time are sufficient for the
Lean launcher surface.

---

## §2. Components & Screens

### Directory layout

```
src/cli/tui/
  index.tsx                 entry, render(<App />)
  app.tsx                   shell + screen-stack
  screens/
    first-run.tsx           auth pick + companion wizard, only when config missing
    launcher.tsx            vertical menu, greeting header
    session.tsx             mode prompt → chat + footer
    settings.tsx            companion edit, auth switch, pack toggles
    about.tsx               version/license/links
  components/
    phase-line.tsx          extracted from current cli-tui.tsx
    token-panel.tsx         extracted from current cli-tui.tsx
    footer.tsx              thin status bar (casual = 1 line, dev = 2 lines)
    chat-scrollback.tsx     turn list with auto-scroll, resize-aware
    menu.tsx                keyboard-nav vertical menu primitive
    text-input.tsx          controlled input (Ink ref pattern)
  store/
    sessions.ts             JSONL read/write/list/prune
    auth.ts                 env > ~/.nawaitu/auth.json > prompt resolution
    companion.ts            wraps existing src/cli/companion-config.ts
  hooks/
    use-screen-stack.ts
    use-nawaitu-session.ts  exposes run(), phase state, last trace
```

### Screen contracts

| Screen | Inputs | Behavior | Exits |
|--------|--------|----------|-------|
| `first-run` | none | Auth (oauth/api-key) → companion wizard → save config | `replace(launcher)` on success |
| `launcher` | companion | Vertical menu; "Resume last" disabled when no sessions exist | `push(session\|settings\|about)` or quit |
| `session` | `{ mode, sessionId, replayedTurns? }` | Chat + footer; streams `nawaitu.run()` per turn; appends to JSONL | `pop()` to launcher on Esc/Ctrl-D |
| `settings` | companion | Edit companion / auth / pinned packs | `pop()` |
| `about` | none | Version, license, links | `pop()` |

### Reused vs new

- **Reused:** `core/compose.ts` (`createNawaitu`), `cli/companion-config.ts`,
  `cli/persona-builder.ts`, `cli/setup-wizard.ts` (its prompts can be invoked
  from `first-run.tsx`), all packs, all observability primitives.
- **Extracted from `cli-tui.tsx`:** `PhaseLine`, `TokenPanel`,
  `formatClassification`, `shortenModel` move to `components/`.
- **New:** screen-per-file structure, screen stack hook, footer, chat scrollback,
  menu primitive, sessions store, auth resolver.

---

## §3. Data Flow

### Cold start

```
bin/nawaitu → src/cli/tui/index.tsx → load ~/.nawaitu/companion.json
  ├── missing  → screen-stack: [first-run]
  └── present  → screen-stack: [launcher]
```

### First-run flow

```
first-run
  ├── step 1: auth pick
  │     ├── "Claude subscription (recommended)" → wraps `claude /login`
  │     │     (reuses cli-login.ts logic; surfaces ToS uncertainty per
  │     │     commit 577d53f)
  │     └── "API key" → reads ANTHROPIC_API_KEY or prompts; saves to
  │           ~/.nawaitu/auth.json (chmod 600)
  ├── step 2: companion wizard (existing 4 questions, reused)
  └── save → replace stack with [launcher]
```

### New-session flow

```
launcher → "New session"
  ├── 2-second mode prompt: "Mode? [c]asual / [d]ev (default casual)"
  ├── push session screen with { mode, sessionId: randomUUID() }
  ├── per turn:
  │     ├── nawaitu.run(input, sessionId)
  │     ├── tuiLogger updates footer phase ticks
  │     └── on done: append to ~/.nawaitu/sessions/{id}.jsonl
  └── on exit (Esc/Ctrl-D): pop to launcher
```

### Resume-last flow

```
launcher → "Resume last"
  ├── store.sessions.loadMostRecent() → { sessionId, mode, turns[] }
  ├── push session screen with replayedTurns
  ├── continues writing to same JSONL (cost/metrics keep aggregating)
  └── exit behavior identical to new-session
```

### Persistence schema

`~/.nawaitu/sessions/{sessionId}.jsonl` — one JSON object per line:

```jsonl
{"v":1,"type":"session-start","mode":"casual","createdAt":"2026-04-28T13:53:00Z","companionVersion":1}
{"v":1,"type":"turn","input":"...","output":"...","trace":{...},"ts":"2026-04-28T13:53:12Z"}
{"v":1,"type":"turn",...}
```

`v` field is reserved for forward-compatible schema migrations. On launcher
load, prune to the most recent 50 files by mtime.

---

## §4. Error Handling

| Failure | Behavior |
|--------|----------|
| Auth failure (first-run or mid-session) | Inline error in screen; offer retry / switch method. TUI stays alive. |
| `companion.json` corruption | On read error, back up to `companion.json.bak`, re-trigger first-run wizard. Writes are atomic (tmp+rename). |
| Session JSONL corruption | Skip the bad file with a one-line stderr warning; continue. Does not block launcher. |
| Mid-turn Anthropic API error | Render as system-message turn in scrollback; mark `trace.outcome=error`; session stays alive; user can retry. |
| `Ctrl-C` mid-turn | Single confirmation prompt before exit. Pending JSONL writes flush before exit. |
| `Ctrl-C` between turns | Immediate clean exit. |
| Terminal resize | Ink handles layout; `chat-scrollback` re-measures viewport. |
| Subscription-auth ToS uncertainty | Existing warning (commit 577d53f) surfaces in `first-run.tsx` when user picks the subscription path. |
| Network unreachable on first auth | Inline error with retry; falls back to API key option without restarting wizard. |

---

## §5. Testing

### Test infrastructure

- **`ink-testing-library`** — added as the single new dev dependency. Powers
  snapshot-style screen tests.
- **Vitest** (already configured) runs the suite; no new test runner.
- **No real Anthropic API in tests.** Stub `Nawaitu` is constructed with canned
  turn outputs (same pattern existing tests use).

### Test plan

| Layer | What | Where |
|------|------|-------|
| Component | `phase-line`, `token-panel`, `menu`, `footer` snapshot tests | `tests/cli/tui/components/` |
| Screen | Each screen renders correctly given props; menu navigation; mode-prompt parsing | `tests/cli/tui/screens/` |
| Store | `sessions.ts` round-trips, prunes correctly, handles corrupt files | `tests/cli/tui/store/` |
| Auth | env > file > prompt precedence; chmod 600 verified | `tests/cli/tui/store/` |
| End-to-end smoke | Spawn TUI with stub Nawaitu, drive via stdin, assert final scrollback + JSONL output | `tests/cli/tui-smoke.test.ts` |

### Coverage target

No formal coverage gate, but: every screen has at least one snapshot test, the
session-store has both happy-path and corruption tests, and the e2e smoke
exercises the full first-run → new-session → resume-last loop.

### Eval impact

Zero. Pack evals exercise `createNawaitu()` programmatically and never go
through the TUI.

---

## Open questions for the implementation plan

These are not blockers — the implementation plan can resolve them:

1. **Footer minimum width.** What does the footer collapse to below 60 columns?
   Likely "phase ticks + cost only", no latency.
2. **Resume-last replay performance.** For sessions with many turns, replay must
   not block the UI. Probably load lazily into scrollback as user scrolls up.
3. **Settings live-editing.** Does changing voice mid-session take effect on
   the next turn, or only on new sessions? v1 leaning: next session only.
4. **Session lock files.** If two `nawaitu` instances run simultaneously and
   both pick "Resume last", do they share the JSONL? v1: simple last-writer-wins;
   document the limitation.

---

## Out of scope (recorded for future plans)

- History browser screen (v1.1+).
- Pack inspector screen (v1.1+).
- In-TUI eval runner (v1.x).
- Long-term cross-session memory (Level 3, separate spec).
- Single-binary distribution (v1.1).
- Homebrew tap (v1.1).
- Themes / color customization (v2).
- Plugin system for third-party packs (v2+).

---

## Acceptance criteria for v1 ship

- `nawaitu` (no args, TTY) launches into the TUI.
- First-run flow completes in under 2 minutes for both auth paths.
- New session → casual mode shows thin footer; dev mode shows expanded footer.
- Resume last successfully restores a 20-turn session within 1 second.
- All five test layers pass; no real API hits in tests.
- `bin/nawaitu` headless paths (`echo ... | nawaitu`, `nawaitu "..."`) still
  work identically to today.
- First public npm publish (version per semver — implementation plan to decide;
  current `0.1.0` in `package.json` reflects pre-public dev state).

# End-User TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public-release Ink TUI for Niato that serves both developer and companion-style end users in one cohesive app, with mode picked per-session and full observability surfaced via a thin always-visible footer.

**Architecture:** Screen-per-file Ink app under `src/cli/tui/`, with a tiny custom screen-stack hook for navigation, JSONL session persistence at `~/.niato/sessions/`, and a TTY-aware shell entry point. Existing single-shot CLI entries (`pnpm dev`, `pnpm chat`, `pnpm dev:tui`) remain functional during transition.

**Tech Stack:** TypeScript strict mode · React 19 · Ink 7 · ink-spinner · ink-testing-library (new dev-dep) · vitest · Node 20+.

**Spec reference:** `docs/superpowers/specs/2026-04-28-end-user-tui-design.md` (commit `1a2abf9`).

---

## Pre-flight (read before starting)

1. **Worktree (recommended).** Run from a fresh worktree to keep master clean:
   ```bash
   git worktree add ../niato-tui -b feat/end-user-tui
   cd ../niato-tui
   ```
2. **Two spec divergences from the original design — both intentional and noted in the plan:**
   - `store/companion.ts` is dropped (YAGNI). Screens import `cli/companion-config.ts` directly. Saves a layer of pure indirection.
   - `bin/niato`'s default subcommand changes from `chat` to a new `tui` script. `niato chat` still works (legacy REPL stays addressable). Documented in Task 19.
3. **TDD discipline.** Every behavior task: write failing test → run → verify failure → implement → run → verify pass → commit. Don't skip the failing-test step.
4. **Commit cadence.** One commit per task. Use the commit messages provided.
5. **No real Anthropic API in tests.** Use the `StubNiato` helper from Task 5.

---

## File map

```
src/cli/tui/
  index.tsx                       Task 18  · entry, render(<App/>)
  app.tsx                         Task 17  · shell + screen-stack glue
  screens/
    about.tsx                     Task 12
    settings.tsx                  Task 13
    launcher.tsx                  Task 14
    session.tsx                   Task 15
    first-run.tsx                 Task 16
  components/
    menu.tsx                      Task 6
    text-input.tsx                Task 7
    phase-line.tsx                Task 8   · extracted from cli-tui.tsx
    token-panel.tsx               Task 9   · extracted from cli-tui.tsx
    footer.tsx                    Task 10
    chat-scrollback.tsx           Task 11
  store/
    sessions.ts                   Task 2
    auth.ts                       Task 3
  hooks/
    use-screen-stack.ts           Task 4
    use-niato-session.ts        Task 5
tests/cli/tui/
  store/sessions.test.ts          Task 2
  store/auth.test.ts              Task 3
  hooks/use-screen-stack.test.tsx Task 4
  hooks/use-niato-session.test.tsx Task 5
  components/*.test.tsx           Tasks 6–11
  screens/*.test.tsx              Tasks 12–16
  app.test.tsx                    Task 17
tests/cli/tui-smoke.test.ts       Task 20  · end-to-end
package.json                      Tasks 1, 19
bin/niato                       Task 19
README.md                         Task 21
src/cli-tui.tsx                   Tasks 8, 9   · update imports after extraction
```

---

## Task 1: Add dev dep + scaffold directories

**Files:**
- Modify: `package.json`
- Create: `src/cli/tui/.gitkeep` (and sibling dirs)

- [ ] **Step 1: Install ink-testing-library**

```bash
pnpm add -D ink-testing-library@^4
```

Expected: package added to `devDependencies`; lockfile updated.

- [ ] **Step 2: Create directory skeleton**

```bash
mkdir -p src/cli/tui/screens src/cli/tui/components src/cli/tui/store src/cli/tui/hooks
mkdir -p tests/cli/tui/screens tests/cli/tui/components tests/cli/tui/store tests/cli/tui/hooks
```

- [ ] **Step 3: Verify typecheck still passes**

```bash
pnpm typecheck
```

Expected: PASS (no source changes yet, just deps + dirs).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/cli/tui tests/cli/tui
git commit -m "chore(tui): scaffold src/cli/tui dirs + add ink-testing-library"
```

---

## Task 2: Session store (`store/sessions.ts`)

**Files:**
- Create: `src/cli/tui/store/sessions.ts`
- Test: `tests/cli/tui/store/sessions.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/store/sessions.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendSessionStart,
  appendTurn,
  loadSession,
  loadMostRecent,
  listRecentSessions,
  pruneSessions,
} from "../../../../src/cli/tui/store/sessions.js";
import { type TurnRecord } from "../../../../src/observability/trace.js";

const fakeTrace = (): TurnRecord => ({
  sessionId: "s1",
  turnId: "t1",
  classification: { domain: "generic", intent: "explain", confidence: 0.9 },
  plan: ["generic.explain"],
  costUsd: 0.001,
  latencyMs: 1234,
  tokensByModel: {},
  outcome: "ok",
  guardrailsTriggered: {},
});

describe("session store", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "niato-test-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a session start + turns via JSONL", () => {
    appendSessionStart("s1", "casual", 1, dir);
    appendTurn("s1", "hello", "world", fakeTrace(), undefined, dir);
    appendTurn("s1", "again", "again-out", fakeTrace(), undefined, dir);

    const loaded = loadSession("s1", dir);
    expect(loaded).not.toBeNull();
    expect(loaded!.mode).toBe("casual");
    expect(loaded!.turns).toHaveLength(2);
    expect(loaded!.turns[0]!.input).toBe("hello");
    expect(loaded!.turns[1]!.output).toBe("again-out");
  });

  it("returns null for missing session", () => {
    expect(loadSession("nope", dir)).toBeNull();
  });

  it("skips corrupt lines without crashing", () => {
    appendSessionStart("s1", "casual", 1, dir);
    writeFileSync(join(dir, "s1.jsonl"), "not-json\n", { flag: "a" });
    appendTurn("s1", "ok", "ok-out", fakeTrace(), undefined, dir);

    const loaded = loadSession("s1", dir);
    expect(loaded!.turns).toHaveLength(1);
    expect(loaded!.turns[0]!.input).toBe("ok");
  });

  it("listRecent + loadMostRecent order by mtime desc", async () => {
    appendSessionStart("old", "casual", 1, dir);
    await new Promise((r) => setTimeout(r, 10));
    appendSessionStart("new", "dev", 1, dir);

    const list = listRecentSessions(dir);
    expect(list[0]!.sessionId).toBe("new");
    expect(loadMostRecent(dir)!.sessionId).toBe("new");
  });

  it("prune deletes everything past maxKeep", () => {
    for (let i = 0; i < 5; i++) appendSessionStart(`s${String(i)}`, "casual", 1, dir);
    const removed = pruneSessions(2, dir);
    expect(removed).toBe(3);
    expect(listRecentSessions(dir)).toHaveLength(2);
    expect(existsSync(join(dir, "s0.jsonl"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
pnpm test tests/cli/tui/store/sessions.test.ts
```

Expected: FAIL with "Cannot find module ... sessions.js".

- [ ] **Step 3: Implement `src/cli/tui/store/sessions.ts`**

```typescript
import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { type IntentResult } from "../../../core/classifier/types.js";
import { type TurnRecord } from "../../../observability/trace.js";

export type SessionMode = "casual" | "dev";

export interface SessionStartLine {
  v: 1;
  type: "session-start";
  mode: SessionMode;
  createdAt: string;
  companionVersion: number;
}

export interface SessionTurnLine {
  v: 1;
  type: "turn";
  input: string;
  output: string;
  classification?: IntentResult;
  trace: TurnRecord;
  ts: string;
}

export type SessionLine = SessionStartLine | SessionTurnLine;

export interface LoadedSession {
  sessionId: string;
  mode: SessionMode;
  createdAt: string;
  turns: SessionTurnLine[];
}

export function defaultSessionsDir(): string {
  return join(homedir(), ".niato", "sessions");
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function fileFor(sessionId: string, dir: string): string {
  return join(dir, `${sessionId}.jsonl`);
}

export function appendSessionStart(
  sessionId: string,
  mode: SessionMode,
  companionVersion: number,
  dir: string = defaultSessionsDir(),
): void {
  ensureDir(dir);
  const line: SessionStartLine = {
    v: 1,
    type: "session-start",
    mode,
    createdAt: new Date().toISOString(),
    companionVersion,
  };
  appendFileSync(fileFor(sessionId, dir), `${JSON.stringify(line)}\n`);
}

export function appendTurn(
  sessionId: string,
  input: string,
  output: string,
  trace: TurnRecord,
  classification: IntentResult | undefined,
  dir: string = defaultSessionsDir(),
): void {
  ensureDir(dir);
  const line: SessionTurnLine = {
    v: 1,
    type: "turn",
    input,
    output,
    ...(classification !== undefined ? { classification } : {}),
    trace,
    ts: new Date().toISOString(),
  };
  appendFileSync(fileFor(sessionId, dir), `${JSON.stringify(line)}\n`);
}

export function loadSession(
  sessionId: string,
  dir: string = defaultSessionsDir(),
): LoadedSession | null {
  const file = fileFor(sessionId, dir);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n").filter((l) => l.length > 0);
  let mode: SessionMode | undefined;
  let createdAt: string | undefined;
  const turns: SessionTurnLine[] = [];
  for (const raw of lines) {
    try {
      const obj = JSON.parse(raw) as SessionLine;
      if (obj.type === "session-start") {
        mode = obj.mode;
        createdAt = obj.createdAt;
      } else if (obj.type === "turn") {
        turns.push(obj);
      }
    } catch {
      // skip corrupt line — see error-handling section of design spec
    }
  }
  if (mode === undefined || createdAt === undefined) return null;
  return { sessionId, mode, createdAt, turns };
}

export interface SessionListing {
  sessionId: string;
  mtime: number;
}

export function listRecentSessions(
  dir: string = defaultSessionsDir(),
): SessionListing[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".jsonl"))
    .map((n) => ({
      sessionId: n.replace(/\.jsonl$/, ""),
      mtime: statSync(join(dir, n)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
}

export function loadMostRecent(
  dir: string = defaultSessionsDir(),
): LoadedSession | null {
  const list = listRecentSessions(dir);
  if (list.length === 0) return null;
  return loadSession(list[0]!.sessionId, dir);
}

export function pruneSessions(
  maxKeep: number = 50,
  dir: string = defaultSessionsDir(),
): number {
  const list = listRecentSessions(dir);
  if (list.length <= maxKeep) return 0;
  const toDelete = list.slice(maxKeep);
  for (const { sessionId } of toDelete) {
    unlinkSync(fileFor(sessionId, dir));
  }
  return toDelete.length;
}
```

- [ ] **Step 4: Run test, verify PASS**

```bash
pnpm test tests/cli/tui/store/sessions.test.ts
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/store/sessions.ts tests/cli/tui/store/sessions.test.ts
git commit -m "feat(tui): JSONL session store with prune + corruption-tolerant load"
```

---

## Task 3: Auth resolver (`store/auth.ts`)

**Files:**
- Create: `src/cli/tui/store/auth.ts`
- Test: `tests/cli/tui/store/auth.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/store/auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadAuth,
  saveAuth,
  resolveAuth,
} from "../../../../src/cli/tui/store/auth.js";

describe("auth store", () => {
  let dir: string;
  let path: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "niato-auth-"));
    path = join(dir, "auth.json");
    originalEnv = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalEnv !== undefined) process.env["ANTHROPIC_API_KEY"] = originalEnv;
    else delete process.env["ANTHROPIC_API_KEY"];
  });

  it("returns null when no auth source available", () => {
    expect(resolveAuth(path)).toBeNull();
  });

  it("env var beats file", () => {
    saveAuth({ mode: "api-key", apiKey: "from-file" }, path);
    process.env["ANTHROPIC_API_KEY"] = "from-env";
    const r = resolveAuth(path);
    expect(r?.mode).toBe("api-key");
    expect(r?.apiKey).toBe("from-env");
  });

  it("falls back to file when no env", () => {
    saveAuth({ mode: "subscription" }, path);
    expect(resolveAuth(path)?.mode).toBe("subscription");
  });

  it("save chmods the file to 600", () => {
    saveAuth({ mode: "api-key", apiKey: "k" }, path);
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("load returns null on malformed file", () => {
    // saved file with bad JSON
    saveAuth({ mode: "api-key", apiKey: "k" }, path);
    // Overwrite with garbage
    require("node:fs").writeFileSync(path, "not-json");
    expect(loadAuth(path)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/store/auth.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `src/cli/tui/store/auth.ts`**

```typescript
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type AuthMode = "subscription" | "api-key";

export interface AuthState {
  mode: AuthMode;
  apiKey?: string;
}

export function defaultAuthPath(): string {
  return join(homedir(), ".niato", "auth.json");
}

export function loadAuth(path: string = defaultAuthPath()): AuthState | null {
  if (!existsSync(path)) return null;
  try {
    const obj = JSON.parse(readFileSync(path, "utf8")) as Partial<AuthState>;
    if (obj.mode !== "subscription" && obj.mode !== "api-key") return null;
    if (obj.mode === "api-key") {
      return {
        mode: "api-key",
        ...(typeof obj.apiKey === "string" ? { apiKey: obj.apiKey } : {}),
      };
    }
    return { mode: "subscription" };
  } catch {
    return null;
  }
}

export function saveAuth(
  state: AuthState,
  path: string = defaultAuthPath(),
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  chmodSync(path, 0o600);
}

export function resolveAuth(
  path: string = defaultAuthPath(),
): AuthState | null {
  const env = process.env["ANTHROPIC_API_KEY"];
  if (typeof env === "string" && env.length > 0) {
    return { mode: "api-key", apiKey: env };
  }
  return loadAuth(path);
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
pnpm test tests/cli/tui/store/auth.test.ts
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/store/auth.ts tests/cli/tui/store/auth.test.ts
git commit -m "feat(tui): auth resolver — env > ~/.niato/auth.json with chmod 600"
```

---

## Task 4: Screen-stack hook (`hooks/use-screen-stack.ts`)

**Files:**
- Create: `src/cli/tui/hooks/use-screen-stack.ts`
- Test: `tests/cli/tui/hooks/use-screen-stack.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/hooks/use-screen-stack.test.tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { useScreenStack } from "../../../../src/cli/tui/hooks/use-screen-stack.js";

function Probe({ onReady }: { onReady: (api: ReturnType<typeof useScreenStack>) => void }): React.ReactElement {
  const stack = useScreenStack({ name: "a", props: {} });
  React.useEffect(() => onReady(stack), [stack]);
  return <Text>{stack.current.name}:{String(stack.depth)}</Text>;
}

describe("useScreenStack", () => {
  it("starts with the initial screen", () => {
    let api: ReturnType<typeof useScreenStack> | undefined;
    const { lastFrame } = render(<Probe onReady={(a) => { api = a; }} />);
    expect(lastFrame()).toContain("a:1");
    expect(api!.current.name).toBe("a");
  });

  it("push adds, pop removes, replace swaps top", () => {
    let api: ReturnType<typeof useScreenStack> | undefined;
    const { lastFrame, rerender } = render(<Probe onReady={(a) => { api = a; }} />);

    api!.push("b");
    rerender(<Probe onReady={(a) => { api = a; }} />);
    expect(lastFrame()).toContain("b:2");

    api!.replace("c");
    rerender(<Probe onReady={(a) => { api = a; }} />);
    expect(lastFrame()).toContain("c:2");

    api!.pop();
    rerender(<Probe onReady={(a) => { api = a; }} />);
    expect(lastFrame()).toContain("a:1");
  });

  it("pop is a no-op at depth 1", () => {
    let api: ReturnType<typeof useScreenStack> | undefined;
    const { lastFrame, rerender } = render(<Probe onReady={(a) => { api = a; }} />);
    api!.pop();
    rerender(<Probe onReady={(a) => { api = a; }} />);
    expect(lastFrame()).toContain("a:1");
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/hooks/use-screen-stack.test.tsx
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `src/cli/tui/hooks/use-screen-stack.ts`**

```typescript
import { useCallback, useState } from "react";

export interface Screen {
  name: string;
  props: Record<string, unknown>;
}

export interface ScreenStack {
  current: Screen;
  depth: number;
  push: (name: string, props?: Record<string, unknown>) => void;
  pop: () => void;
  replace: (name: string, props?: Record<string, unknown>) => void;
}

export function useScreenStack(initial: Screen): ScreenStack {
  const [stack, setStack] = useState<Screen[]>([initial]);

  const push = useCallback(
    (name: string, props: Record<string, unknown> = {}): void => {
      setStack((s) => [...s, { name, props }]);
    },
    [],
  );

  const pop = useCallback((): void => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const replace = useCallback(
    (name: string, props: Record<string, unknown> = {}): void => {
      setStack((s) => [...s.slice(0, -1), { name, props }]);
    },
    [],
  );

  return {
    current: stack[stack.length - 1]!,
    depth: stack.length,
    push,
    pop,
    replace,
  };
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
pnpm test tests/cli/tui/hooks/use-screen-stack.test.tsx
```

Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/hooks/use-screen-stack.ts tests/cli/tui/hooks/use-screen-stack.test.tsx
git commit -m "feat(tui): useScreenStack hook for in-app navigation"
```

---

## Task 5: Niato-session hook + StubNiato test helper (`hooks/use-niato-session.ts`)

**Files:**
- Create: `src/cli/tui/hooks/use-niato-session.ts`
- Create: `tests/cli/tui/_helpers/stub-niato.ts`
- Test: `tests/cli/tui/hooks/use-niato-session.test.tsx`

- [ ] **Step 1: Write the StubNiato helper (used by this and downstream tests)**

```typescript
// tests/cli/tui/_helpers/stub-niato.ts
import { type Niato, type NiatoTurn } from "../../../../src/core/compose.js";
import { type SessionMetrics } from "../../../../src/observability/metrics.js";

export interface StubResponse {
  output: string;
  delayMs?: number;
  throws?: Error;
}

export function makeStubNiato(responses: StubResponse[]): Niato {
  let i = 0;
  return {
    async run(input, sessionId): Promise<NiatoTurn> {
      const r = responses[i++] ?? { output: `(no canned response for: ${input})` };
      if (r.delayMs !== undefined) await new Promise((res) => setTimeout(res, r.delayMs));
      if (r.throws) throw r.throws;
      return {
        result: r.output,
        classification: { domain: "generic", intent: "explain", confidence: 0.9 },
        session: {
          id: sessionId ?? "stub-session",
          metrics: { turnCount: i, cumulativeCostUsd: 0, cumulativeLatencyMs: 0, errorCount: 0, guardrailsTriggered: {} } as SessionMetrics,
        } as never,
        messages: [],
        trace: {
          sessionId: sessionId ?? "stub-session",
          turnId: `t${String(i)}`,
          classification: { domain: "generic", intent: "explain", confidence: 0.9 },
          plan: ["generic.explain"],
          costUsd: 0.001,
          latencyMs: 50,
          tokensByModel: {},
          outcome: "ok",
          guardrailsTriggered: {},
        },
      };
    },
    metrics(): SessionMetrics | undefined {
      return undefined;
    },
  };
}
```

- [ ] **Step 2: Write failing test**

```typescript
// tests/cli/tui/hooks/use-niato-session.test.tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { useNiatoSession, type SessionPhase } from "../../../../src/cli/tui/hooks/use-niato-session.js";
import { makeStubNiato } from "../_helpers/stub-niato.js";

function Probe({
  capture,
}: {
  capture: (api: ReturnType<typeof useNiatoSession>) => void;
}): React.ReactElement {
  const api = useNiatoSession(() => makeStubNiato([{ output: "hi back" }, { output: "again" }]), "sess-1");
  React.useEffect(() => capture(api), [api]);
  return <Text>{api.phase}:{String(api.turns.length)}</Text>;
}

describe("useNiatoSession", () => {
  it("phase progresses idle → done after run()", async () => {
    let last: ReturnType<typeof useNiatoSession> | undefined;
    const { lastFrame, rerender } = render(<Probe capture={(a) => { last = a; }} />);
    expect(lastFrame()).toContain("idle:0");

    await last!.run("hello");
    rerender(<Probe capture={(a) => { last = a; }} />);
    expect(last!.phase satisfies SessionPhase).toBe("done");
    expect(last!.turns).toHaveLength(1);
    expect(last!.turns[0]!.output).toBe("hi back");
  });

  it("captures error message when niato throws", async () => {
    let last: ReturnType<typeof useNiatoSession> | undefined;
    function ErrProbe(): React.ReactElement {
      const api = useNiatoSession(
        () => makeStubNiato([{ output: "", throws: new Error("boom") }]),
        "sess-2",
      );
      React.useEffect(() => { last = api; }, [api]);
      return <Text>{api.phase}</Text>;
    }
    const { rerender } = render(<ErrProbe />);
    await last!.run("hello");
    rerender(<ErrProbe />);
    expect(last!.phase).toBe("error");
    expect(last!.turns[0]!.errorMessage).toBe("boom");
  });
});
```

- [ ] **Step 3: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/hooks/use-niato-session.test.tsx
```

Expected: FAIL.

- [ ] **Step 4: Implement `src/cli/tui/hooks/use-niato-session.ts`**

```typescript
import { useRef, useState } from "react";
import { type Niato, type NiatoTurn } from "../../../core/compose.js";
import { type IntentResult } from "../../../core/classifier/types.js";
import { type TurnRecord } from "../../../observability/trace.js";
import { type Logger } from "../../../observability/log.js";

export type SessionPhase = "idle" | "classifying" | "dispatching" | "done" | "error";

export interface TurnState {
  input: string;
  output?: string;
  classification?: IntentResult;
  trace?: TurnRecord;
  errorMessage?: string;
  phase: SessionPhase;
}

export interface UseNiato {
  phase: SessionPhase;
  classification?: IntentResult;
  trace?: TurnRecord;
  turns: TurnState[];
  run: (input: string) => Promise<void>;
}

export function useNiatoSession(
  factory: (logger: Logger) => Niato,
  sessionId: string,
  onTurnComplete?: (turn: TurnState) => void,
): UseNiato {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [classification, setClassification] = useState<IntentResult | undefined>(undefined);
  const [trace, setTrace] = useState<TurnRecord | undefined>(undefined);
  const [turns, setTurns] = useState<TurnState[]>([]);

  const niatoRef = useRef<Niato | null>(null);
  if (niatoRef.current === null) {
    const logger: Logger = {
      log(_level, message, fields): void {
        if (message === "turn start") setPhase("classifying");
        else if (message === "classification") {
          const c = fields?.["classification"];
          if (
            typeof c === "object" &&
            c !== null &&
            typeof (c as { intent?: unknown }).intent === "string"
          ) {
            setClassification(c as IntentResult);
            setPhase("dispatching");
          }
        }
      },
    };
    niatoRef.current = factory(logger);
  }

  async function run(input: string): Promise<void> {
    setPhase("classifying");
    setTurns((t) => [...t, { input, phase: "classifying" }]);
    try {
      const turn: NiatoTurn = await niatoRef.current!.run(input, sessionId);
      const next: TurnState = {
        input,
        output: turn.result,
        classification: turn.classification,
        trace: turn.trace,
        phase: "done",
      };
      setPhase("done");
      setTrace(turn.trace);
      setTurns((t) => [...t.slice(0, -1), next]);
      onTurnComplete?.(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPhase("error");
      setTurns((t) => {
        const last = t[t.length - 1]!;
        return [...t.slice(0, -1), { ...last, phase: "error", errorMessage: msg }];
      });
    }
  }

  return { phase, classification, trace, turns, run };
}
```

- [ ] **Step 5: Run, verify PASS**

```bash
pnpm test tests/cli/tui/hooks/use-niato-session.test.tsx
```

Expected: PASS — all 2 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/cli/tui/hooks/use-niato-session.ts tests/cli/tui/hooks/use-niato-session.test.tsx tests/cli/tui/_helpers/stub-niato.ts
git commit -m "feat(tui): useNiatoSession hook + StubNiato test helper"
```

---

## Task 6: Menu component (`components/menu.tsx`)

**Files:**
- Create: `src/cli/tui/components/menu.tsx`
- Test: `tests/cli/tui/components/menu.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/components/menu.test.tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Menu, type MenuItem } from "../../../../src/cli/tui/components/menu.js";

const items: MenuItem[] = [
  { id: "new", label: "New session" },
  { id: "resume", label: "Resume last" },
  { id: "settings", label: "Settings" },
  { id: "quit", label: "Quit" },
];

describe("Menu", () => {
  it("renders all items and marks the first as selected", () => {
    const { lastFrame } = render(<Menu items={items} onSelect={() => {}} />);
    const out = lastFrame() ?? "";
    expect(out).toContain("New session");
    expect(out).toContain("Resume last");
    expect(out).toContain("Settings");
    expect(out).toContain("Quit");
    // arrow on first item
    expect(out).toMatch(/▸\s+New session/);
  });

  it("respects disabled flag visually", () => {
    const disabled: MenuItem[] = [
      { id: "a", label: "Active" },
      { id: "b", label: "Inactive", disabled: true },
    ];
    const { lastFrame } = render(<Menu items={disabled} onSelect={() => {}} />);
    expect(lastFrame()).toContain("Inactive");
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/components/menu.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/cli/tui/components/menu.tsx`**

```tsx
import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface MenuItem {
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
}

export interface MenuProps {
  items: MenuItem[];
  onSelect: (id: string) => void;
  onCancel?: () => void;
}

export function Menu({ items, onSelect, onCancel }: MenuProps): React.ReactElement {
  const [index, setIndex] = useState<number>(() => items.findIndex((i) => i.disabled !== true));

  useInput((input, key) => {
    if (key.upArrow) {
      setIndex((i) => {
        for (let n = i - 1; n >= 0; n--) if (items[n]?.disabled !== true) return n;
        return i;
      });
    } else if (key.downArrow) {
      setIndex((i) => {
        for (let n = i + 1; n < items.length; n++) if (items[n]?.disabled !== true) return n;
        return i;
      });
    } else if (key.return) {
      const item = items[index];
      if (item && item.disabled !== true) onSelect(item.id);
    } else if (key.escape || input === "q") {
      onCancel?.();
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        const selected = i === index;
        const arrow = selected ? "▸" : " ";
        const color = item.disabled === true ? "gray" : selected ? "cyan" : undefined;
        return (
          <Box key={item.id}>
            <Text color={color} bold={selected}>{`${arrow} ${item.label}`}</Text>
            {item.detail !== undefined && (
              <Text color="gray">{`  · ${item.detail}`}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
pnpm test tests/cli/tui/components/menu.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/components/menu.tsx tests/cli/tui/components/menu.test.tsx
git commit -m "feat(tui): keyboard-nav Menu component"
```

---

## Task 7: TextInput component (`components/text-input.tsx`)

**Files:**
- Create: `src/cli/tui/components/text-input.tsx`
- Test: `tests/cli/tui/components/text-input.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/components/text-input.test.tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { TextInput } from "../../../../src/cli/tui/components/text-input.js";

describe("TextInput", () => {
  it("renders the placeholder when value is empty", () => {
    const { lastFrame } = render(
      <TextInput value="" placeholder="say something" onChange={() => {}} onSubmit={() => {}} />,
    );
    expect(lastFrame()).toContain("say something");
  });

  it("renders the current value when non-empty", () => {
    const { lastFrame } = render(
      <TextInput value="hello" placeholder="x" onChange={() => {}} onSubmit={() => {}} />,
    );
    expect(lastFrame()).toContain("hello");
  });

  it("calls onChange when user types", () => {
    let captured = "";
    const { stdin } = render(
      <TextInput value="" placeholder="" onChange={(v) => { captured = v; }} onSubmit={() => {}} />,
    );
    stdin.write("hi");
    expect(captured).toBe("hi");
  });

  it("calls onSubmit on enter", () => {
    let submitted = "";
    const { stdin } = render(
      <TextInput value="ready" placeholder="" onChange={() => {}} onSubmit={(v) => { submitted = v; }} />,
    );
    stdin.write("\r");
    expect(submitted).toBe("ready");
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/components/text-input.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/cli/tui/components/text-input.tsx`**

```tsx
import React from "react";
import { Box, Text, useInput } from "ink";

export interface TextInputProps {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}

export function TextInput({ value, placeholder, onChange, onSubmit }: TextInputProps): React.ReactElement {
  useInput((input, key) => {
    if (key.return) {
      onSubmit(value);
      return;
    }
    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }
    if (key.ctrl || key.meta) return;
    if (input.length > 0 && !key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow) {
      onChange(value + input);
    }
  });

  return (
    <Box>
      <Text color="cyan">{"› "}</Text>
      {value.length === 0 ? (
        <Text color="gray">{placeholder}</Text>
      ) : (
        <Text>{value}</Text>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
pnpm test tests/cli/tui/components/text-input.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/components/text-input.tsx tests/cli/tui/components/text-input.test.tsx
git commit -m "feat(tui): controlled TextInput component"
```

---

## Task 8: PhaseLine component — extract from `cli-tui.tsx`

**Files:**
- Create: `src/cli/tui/components/phase-line.tsx`
- Modify: `src/cli-tui.tsx` (replace inline component with import)
- Test: `tests/cli/tui/components/phase-line.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/components/phase-line.test.tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { PhaseLine } from "../../../../src/cli/tui/components/phase-line.js";

describe("PhaseLine", () => {
  it("shows ✓ when done", () => {
    const { lastFrame } = render(<PhaseLine label="Classify" active={false} done={true} failed={false} />);
    expect(lastFrame()).toMatch(/✓\s+Classify/);
  });

  it("shows ✗ when failed", () => {
    const { lastFrame } = render(<PhaseLine label="Dispatch" active={false} done={false} failed={true} />);
    expect(lastFrame()).toMatch(/✗\s+Dispatch/);
  });

  it("renders detail when provided", () => {
    const { lastFrame } = render(
      <PhaseLine label="Classify" active={false} done={true} failed={false} detail="generic/explain (92%)" />,
    );
    expect(lastFrame()).toContain("generic/explain (92%)");
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/components/phase-line.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/cli/tui/components/phase-line.tsx`** (extracted verbatim from cli-tui.tsx with minor cleanup)

```tsx
import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export interface PhaseLineProps {
  label: string;
  active: boolean;
  done: boolean;
  failed: boolean;
  detail?: string | undefined;
}

export function PhaseLine({ label, active, done, failed, detail }: PhaseLineProps): React.ReactElement {
  let icon: React.ReactElement;
  if (failed) {
    icon = <Text color="red">✗</Text>;
  } else if (done) {
    icon = <Text color="green">✓</Text>;
  } else if (active) {
    icon = (
      <Text color="yellow">
        <Spinner type="dots" />
      </Text>
    );
  } else {
    icon = <Text color="gray">·</Text>;
  }
  return (
    <Box>
      <Box marginRight={1}>{icon}</Box>
      <Text {...(done ? {} : { color: "gray" })}>{label}</Text>
      {detail !== undefined && (
        <Text color="cyan">{`  ${detail}`}</Text>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Update `src/cli-tui.tsx` to import the extracted component**

In `src/cli-tui.tsx`, **delete** the inline `PhaseLine` function (lines 183–219 of the existing file) and add at the top:

```tsx
import { PhaseLine } from "./cli/tui/components/phase-line.js";
```

Verify the existing single-turn TUI still typechecks:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Run all relevant tests**

```bash
pnpm test tests/cli/tui/components/phase-line.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli/tui/components/phase-line.tsx tests/cli/tui/components/phase-line.test.tsx src/cli-tui.tsx
git commit -m "refactor(tui): extract PhaseLine to components/, reuse in cli-tui.tsx"
```

---

## Task 9: TokenPanel component — extract from `cli-tui.tsx`

**Files:**
- Create: `src/cli/tui/components/token-panel.tsx`
- Modify: `src/cli-tui.tsx`
- Test: `tests/cli/tui/components/token-panel.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/components/token-panel.test.tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { TokenPanel } from "../../../../src/cli/tui/components/token-panel.js";
import { type TurnRecord } from "../../../../src/observability/trace.js";

const fakeTrace: TurnRecord = {
  sessionId: "s",
  turnId: "t",
  classification: { domain: "generic", intent: "explain", confidence: 0.9 },
  plan: ["generic.explain"],
  costUsd: 0.0034,
  latencyMs: 2100,
  tokensByModel: {
    "claude-sonnet-4-6-20260101": {
      inputTokens: 421, outputTokens: 312, cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
    },
  },
  outcome: "ok",
  guardrailsTriggered: {},
};

describe("TokenPanel", () => {
  it("renders model row + cost + latency", () => {
    const { lastFrame } = render(<TokenPanel trace={fakeTrace} />);
    const out = lastFrame() ?? "";
    expect(out).toContain("sonnet-4-6");
    expect(out).toContain("421 in");
    expect(out).toContain("$0.0034");
    expect(out).toMatch(/2\.1s/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/components/token-panel.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/cli/tui/components/token-panel.tsx`** (extracted from cli-tui.tsx)

```tsx
import React from "react";
import { Box, Text } from "ink";
import { type TurnRecord } from "../../../observability/trace.js";

export interface TokenPanelProps {
  trace: TurnRecord;
}

function shortenModel(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

export function TokenPanel({ trace }: TokenPanelProps): React.ReactElement {
  const rows = Object.entries(trace.tokensByModel);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">Tokens</Text>
      {rows.map(([model, usage]) => (
        <Box key={model}>
          <Box width={32}>
            <Text>{shortenModel(model)}</Text>
          </Box>
          <Text color="gray">
            {`${String(usage.inputTokens)} in · ${String(usage.outputTokens)} out · ${String(usage.cacheReadInputTokens)} cache-read · ${String(usage.cacheCreationInputTokens)} cache-create`}
          </Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color="gray">{`Cost $${trace.costUsd.toFixed(4)} · Latency ${(trace.latencyMs / 1000).toFixed(1)}s · Outcome ${trace.outcome}`}</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Update `src/cli-tui.tsx`**

Delete inline `TokenPanel` and `shortenModel` (lines 221–245 of the existing file) and replace with:

```tsx
import { TokenPanel } from "./cli/tui/components/token-panel.js";
```

- [ ] **Step 5: Run, verify PASS**

```bash
pnpm test tests/cli/tui/components/token-panel.test.tsx
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli/tui/components/token-panel.tsx tests/cli/tui/components/token-panel.test.tsx src/cli-tui.tsx
git commit -m "refactor(tui): extract TokenPanel to components/, reuse in cli-tui.tsx"
```

---

## Task 10: Footer component (`components/footer.tsx`)

**Files:**
- Create: `src/cli/tui/components/footer.tsx`
- Test: `tests/cli/tui/components/footer.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/components/footer.test.tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Footer } from "../../../../src/cli/tui/components/footer.js";
import { type TurnRecord } from "../../../../src/observability/trace.js";

const fakeTrace: TurnRecord = {
  sessionId: "s", turnId: "t",
  classification: { domain: "generic", intent: "explain", confidence: 0.92 },
  plan: ["generic.explain"],
  costUsd: 0.0034, latencyMs: 2100, tokensByModel: {}, outcome: "ok", guardrailsTriggered: {},
};

describe("Footer", () => {
  it("casual mode: one-line summary", () => {
    const { lastFrame } = render(
      <Footer mode="casual" phase="done" classification={fakeTrace.classification} trace={fakeTrace} />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("✓ classify");
    expect(out).toContain("✓ dispatch");
    expect(out).toContain("$0.0034");
    expect(out).toMatch(/2\.1s/);
  });

  it("dev mode: adds dispatch path", () => {
    const { lastFrame } = render(
      <Footer mode="dev" phase="done" classification={fakeTrace.classification} trace={fakeTrace} />,
    );
    expect(lastFrame()).toContain("generic.explain");
  });

  it("idle phase: shows waiting hint", () => {
    const { lastFrame } = render(<Footer mode="casual" phase="idle" />);
    expect(lastFrame()).toMatch(/ready|waiting|·/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/components/footer.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/cli/tui/components/footer.tsx`**

```tsx
import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { type IntentResult } from "../../../core/classifier/types.js";
import { type TurnRecord } from "../../../observability/trace.js";
import { type SessionPhase } from "../hooks/use-niato-session.js";
import { type SessionMode } from "../store/sessions.js";

export interface FooterProps {
  mode: SessionMode;
  phase: SessionPhase;
  classification?: IntentResult;
  trace?: TurnRecord;
}

function tickFor(active: boolean, done: boolean, failed: boolean): React.ReactElement {
  if (failed) return <Text color="red">✗</Text>;
  if (done) return <Text color="green">✓</Text>;
  if (active) return <Text color="yellow"><Spinner type="dots" /></Text>;
  return <Text color="gray">·</Text>;
}

export function Footer({ mode, phase, classification, trace }: FooterProps): React.ReactElement {
  const classifyDone = classification !== undefined;
  const classifyActive = phase === "classifying";
  const dispatchDone = phase === "done";
  const dispatchActive = phase === "dispatching";
  const failed = phase === "error";

  if (phase === "idle") {
    return (
      <Box>
        <Text color="gray">· ready</Text>
      </Box>
    );
  }

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
```

- [ ] **Step 4: Run, verify PASS**

```bash
pnpm test tests/cli/tui/components/footer.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/components/footer.tsx tests/cli/tui/components/footer.test.tsx
git commit -m "feat(tui): Footer component — thin status bar (casual 1-line, dev 2-line)"
```

---

## Task 11: ChatScrollback component (`components/chat-scrollback.tsx`)

**Files:**
- Create: `src/cli/tui/components/chat-scrollback.tsx`
- Test: `tests/cli/tui/components/chat-scrollback.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/components/chat-scrollback.test.tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { ChatScrollback } from "../../../../src/cli/tui/components/chat-scrollback.js";
import { type TurnState } from "../../../../src/cli/tui/hooks/use-niato-session.js";

const turn = (input: string, output?: string): TurnState => ({
  input,
  ...(output !== undefined ? { output } : {}),
  phase: output !== undefined ? "done" : "classifying",
});

describe("ChatScrollback", () => {
  it("renders user input + assistant output for each turn", () => {
    const { lastFrame } = render(
      <ChatScrollback turns={[turn("hi", "hello"), turn("how are you", "good")]} userLabel="you" assistantLabel="arienz" />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("hi");
    expect(out).toContain("hello");
    expect(out).toContain("how are you");
    expect(out).toContain("good");
    expect(out).toContain("you");
    expect(out).toContain("arienz");
  });

  it("renders the in-flight turn without an output yet", () => {
    const { lastFrame } = render(
      <ChatScrollback turns={[turn("loading...")]} userLabel="you" assistantLabel="arienz" />,
    );
    expect(lastFrame()).toContain("loading...");
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/components/chat-scrollback.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/cli/tui/components/chat-scrollback.tsx`**

```tsx
import React from "react";
import { Box, Text } from "ink";
import { type TurnState } from "../hooks/use-niato-session.js";

export interface ChatScrollbackProps {
  turns: TurnState[];
  userLabel: string;
  assistantLabel: string;
}

export function ChatScrollback({ turns, userLabel, assistantLabel }: ChatScrollbackProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {turns.map((t, idx) => (
        <Box key={idx} flexDirection="column" marginBottom={1}>
          <Box>
            <Box marginRight={1}>
              <Text color="cyan" bold>{userLabel}</Text>
            </Box>
            <Text>{t.input}</Text>
          </Box>
          {t.output !== undefined && (
            <Box marginTop={0}>
              <Box marginRight={1}>
                <Text color="yellow" bold>{assistantLabel}</Text>
              </Box>
              <Text>{t.output}</Text>
            </Box>
          )}
          {t.errorMessage !== undefined && (
            <Box>
              <Text color="red">{`error: ${t.errorMessage}`}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
pnpm test tests/cli/tui/components/chat-scrollback.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/components/chat-scrollback.tsx tests/cli/tui/components/chat-scrollback.test.tsx
git commit -m "feat(tui): ChatScrollback turn list component"
```

---

## Task 12: About screen (`screens/about.tsx`)

**Files:**
- Create: `src/cli/tui/screens/about.tsx`
- Test: `tests/cli/tui/screens/about.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/screens/about.test.tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { About } from "../../../../src/cli/tui/screens/about.js";

describe("About screen", () => {
  it("renders version and license info", () => {
    const { lastFrame } = render(<About version="0.1.0" onBack={() => {}} />);
    const out = lastFrame() ?? "";
    expect(out).toContain("Niato");
    expect(out).toContain("0.1.0");
    expect(out).toMatch(/license/i);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/screens/about.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/cli/tui/screens/about.tsx`**

```tsx
import React from "react";
import { Box, Text, useInput } from "ink";

export interface AboutProps {
  version: string;
  onBack: () => void;
}

export function About({ version, onBack }: AboutProps): React.ReactElement {
  useInput((input, key) => {
    if (key.escape || input === "q" || key.return) onBack();
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">Niato</Text>
      <Text color="gray">{`version ${version}`}</Text>
      <Box marginTop={1}>
        <Text>Intent-routing agent on the Claude Agent SDK.</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color="gray">License: see package.json</Text>
        <Text color="gray">Docs: README.md · ARCHITECTURE.md</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">esc / q / enter — back</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
pnpm test tests/cli/tui/screens/about.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/screens/about.tsx tests/cli/tui/screens/about.test.tsx
git commit -m "feat(tui): About screen"
```

---

## Task 13: Settings screen (`screens/settings.tsx`)

**Scope of v1 settings screen:** show current values + offer "Re-run companion wizard" and "Re-run auth setup" actions. Inline editing of individual fields is a v1.x add-on; for v1 we keep it simple by re-running the relevant sub-wizard.

**Files:**
- Create: `src/cli/tui/screens/settings.tsx`
- Test: `tests/cli/tui/screens/settings.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/screens/settings.test.tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Settings } from "../../../../src/cli/tui/screens/settings.js";
import { type Companion } from "../../../../src/cli/companion-config.js";
import { type AuthState } from "../../../../src/cli/tui/store/auth.js";

const companion: Companion = {
  version: 1, name: "Arienz", voice: "warm", createdAt: "2026-04-28T00:00:00Z",
};
const auth: AuthState = { mode: "subscription" };

describe("Settings screen", () => {
  it("renders companion and auth summary", () => {
    const { lastFrame } = render(
      <Settings
        companion={companion}
        auth={auth}
        onBack={() => {}}
        onResetCompanion={() => {}}
        onResetAuth={() => {}}
      />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("Arienz");
    expect(out).toContain("warm");
    expect(out).toContain("subscription");
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/screens/settings.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/cli/tui/screens/settings.tsx`**

```tsx
import React from "react";
import { Box, Text } from "ink";
import { Menu, type MenuItem } from "../components/menu.js";
import { type Companion } from "../../companion-config.js";
import { type AuthState } from "../store/auth.js";

export interface SettingsProps {
  companion: Companion;
  auth: AuthState | null;
  onBack: () => void;
  onResetCompanion: () => void;
  onResetAuth: () => void;
}

export function Settings({ companion, auth, onBack, onResetCompanion, onResetAuth }: SettingsProps): React.ReactElement {
  const items: MenuItem[] = [
    { id: "companion", label: "Re-run companion wizard", detail: `${companion.name} · ${companion.voice}` },
    { id: "auth", label: "Re-run auth setup", detail: auth?.mode ?? "(none)" },
    { id: "back", label: "Back" },
  ];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">Settings</Text>
      <Box marginTop={1}>
        <Menu
          items={items}
          onSelect={(id) => {
            if (id === "companion") onResetCompanion();
            else if (id === "auth") onResetAuth();
            else onBack();
          }}
          onCancel={onBack}
        />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
pnpm test tests/cli/tui/screens/settings.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/screens/settings.tsx tests/cli/tui/screens/settings.test.tsx
git commit -m "feat(tui): Settings screen — companion + auth re-run entry points"
```

---

## Task 14: Launcher screen (`screens/launcher.tsx`)

**Files:**
- Create: `src/cli/tui/screens/launcher.tsx`
- Test: `tests/cli/tui/screens/launcher.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/screens/launcher.test.tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Launcher } from "../../../../src/cli/tui/screens/launcher.js";
import { type Companion } from "../../../../src/cli/companion-config.js";

const companion: Companion = {
  version: 1, name: "Arienz", voice: "warm", createdAt: "2026-04-28T00:00:00Z",
};

describe("Launcher screen", () => {
  it("shows the four lean menu items + greeting", () => {
    const { lastFrame } = render(
      <Launcher
        companion={companion}
        hasResumable={true}
        onSelect={() => {}}
      />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("New session");
    expect(out).toContain("Resume last");
    expect(out).toContain("Settings");
    expect(out).toContain("About");
    expect(out).toContain("Arienz");
  });

  it("disables Resume last when no resumable session exists", () => {
    const { lastFrame } = render(
      <Launcher companion={companion} hasResumable={false} onSelect={() => {}} />,
    );
    expect(lastFrame()).toContain("Resume last");
    // The disabled Menu item is gray; arrow won't sit on it. Best assertion
    // is that arrow is on "New session".
    expect(lastFrame()).toMatch(/▸\s+New session/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/screens/launcher.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/cli/tui/screens/launcher.tsx`**

```tsx
import React from "react";
import { Box, Text } from "ink";
import { Menu, type MenuItem } from "../components/menu.js";
import { type Companion } from "../../companion-config.js";

export type LauncherChoice = "new" | "resume" | "settings" | "about" | "quit";

export interface LauncherProps {
  companion: Companion;
  hasResumable: boolean;
  onSelect: (choice: LauncherChoice) => void;
}

function timeOfDay(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "late night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "late evening";
}

export function Launcher({ companion, hasResumable, onSelect }: LauncherProps): React.ReactElement {
  const items: MenuItem[] = [
    { id: "new", label: "New session" },
    { id: "resume", label: "Resume last", disabled: !hasResumable, detail: hasResumable ? undefined : "(no sessions yet)" },
    { id: "settings", label: "Settings" },
    { id: "about", label: "About" },
  ];

  const greetingTo = companion.userName ?? "you";

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">{companion.name}</Text>
      <Text color="gray">{`${timeOfDay()}, ${greetingTo}.`}</Text>
      <Box marginTop={1}>
        <Menu
          items={items}
          onSelect={(id) => onSelect(id as LauncherChoice)}
          onCancel={() => onSelect("quit")}
        />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
pnpm test tests/cli/tui/screens/launcher.test.tsx
```

Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/screens/launcher.tsx tests/cli/tui/screens/launcher.test.tsx
git commit -m "feat(tui): Launcher screen — Lean menu + greeting"
```

---

## Task 15: Session screen (`screens/session.tsx`)

This is the largest screen. It composes ChatScrollback + TextInput + Footer, and threads useNiatoSession with on-turn JSONL persistence.

**Files:**
- Create: `src/cli/tui/screens/session.tsx`
- Test: `tests/cli/tui/screens/session.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/screens/session.test.tsx
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import { Session } from "../../../../src/cli/tui/screens/session.js";
import { type Companion } from "../../../../src/cli/companion-config.js";
import { makeStubNiato } from "../_helpers/stub-niato.js";

const companion: Companion = {
  version: 1, name: "Arienz", voice: "warm", createdAt: "2026-04-28T00:00:00Z",
};

describe("Session screen", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "niato-session-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("submits a turn and writes it to the JSONL file", async () => {
    const { stdin, lastFrame, rerender } = render(
      <Session
        companion={companion}
        mode="casual"
        sessionId="ses-1"
        sessionsDir={dir}
        niatoFactory={() => makeStubNiato([{ output: "hi back" }])}
        replayedTurns={[]}
        onExit={() => {}}
      />,
    );

    stdin.write("hi");
    stdin.write("\r");

    // wait a tick for async run() to resolve
    await new Promise((r) => setTimeout(r, 30));
    rerender(
      <Session
        companion={companion}
        mode="casual"
        sessionId="ses-1"
        sessionsDir={dir}
        niatoFactory={() => makeStubNiato([{ output: "hi back" }])}
        replayedTurns={[]}
        onExit={() => {}}
      />,
    );

    expect(lastFrame()).toContain("hi back");

    const file = join(dir, "ses-1.jsonl");
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2); // session-start + at least 1 turn
  });

  it("renders replayed turns from a resumed session", () => {
    const { lastFrame } = render(
      <Session
        companion={companion}
        mode="casual"
        sessionId="ses-2"
        sessionsDir={dir}
        niatoFactory={() => makeStubNiato([])}
        replayedTurns={[
          { input: "earlier q", output: "earlier a", phase: "done" },
        ]}
        onExit={() => {}}
      />,
    );
    expect(lastFrame()).toContain("earlier q");
    expect(lastFrame()).toContain("earlier a");
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/screens/session.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/cli/tui/screens/session.tsx`**

```tsx
import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { ChatScrollback } from "../components/chat-scrollback.js";
import { Footer } from "../components/footer.js";
import { TextInput } from "../components/text-input.js";
import {
  useNiatoSession,
  type TurnState,
} from "../hooks/use-niato-session.js";
import {
  appendSessionStart,
  appendTurn,
  type SessionMode,
} from "../store/sessions.js";
import { type Companion } from "../../companion-config.js";
import { type Niato } from "../../../core/compose.js";
import { type Logger } from "../../../observability/log.js";

export interface SessionProps {
  companion: Companion;
  mode: SessionMode;
  sessionId: string;
  sessionsDir?: string;
  niatoFactory: (logger: Logger) => Niato;
  replayedTurns: TurnState[];
  onExit: () => void;
}

export function Session({
  companion,
  mode,
  sessionId,
  sessionsDir,
  niatoFactory,
  replayedTurns,
  onExit,
}: SessionProps): React.ReactElement {
  const [draft, setDraft] = useState<string>("");
  const startedRef = useRef<boolean>(false);

  // Write session-start once. For resumed sessions, the original
  // session-start line already exists in the JSONL, so we skip.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (replayedTurns.length === 0) {
      appendSessionStart(sessionId, mode, companion.version, sessionsDir);
    }
  }, [sessionId, mode, companion.version, sessionsDir, replayedTurns.length]);

  const session = useNiatoSession(
    niatoFactory,
    sessionId,
    (turn: TurnState) => {
      if (turn.output !== undefined && turn.trace !== undefined) {
        appendTurn(
          sessionId,
          turn.input,
          turn.output,
          turn.trace,
          turn.classification,
          sessionsDir,
        );
      }
    },
  );

  useInput((_input, key) => {
    if (key.escape) onExit();
  });

  const allTurns: TurnState[] = [...replayedTurns, ...session.turns];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">{companion.name}</Text>
        <Text color="gray">{`  · ${mode} · session ${sessionId.slice(0, 8)} · esc to exit`}</Text>
      </Box>

      <ChatScrollback
        turns={allTurns}
        userLabel={companion.userName ?? "you"}
        assistantLabel={companion.name.toLowerCase()}
      />

      <Box marginTop={1}>
        <TextInput
          value={draft}
          placeholder="type your message..."
          onChange={setDraft}
          onSubmit={(v) => {
            if (v.trim().length === 0) return;
            setDraft("");
            void session.run(v);
          }}
        />
      </Box>

      <Box marginTop={1}>
        <Footer
          mode={mode}
          phase={session.phase}
          {...(session.classification !== undefined ? { classification: session.classification } : {})}
          {...(session.trace !== undefined ? { trace: session.trace } : {})}
        />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
pnpm test tests/cli/tui/screens/session.test.tsx
```

Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/screens/session.tsx tests/cli/tui/screens/session.test.tsx
git commit -m "feat(tui): Session screen — chat + footer + JSONL persistence"
```

---

## Task 16: First-run screen (`screens/first-run.tsx`)

For v1, the first-run screen handles the **auth pick** step using a simple Menu. The companion wizard step is delegated to the existing `cli/setup-wizard.ts` (readline-based). On screen mount, if companion is missing, we show auth pick → on selection, write auth state, then the parent app dismounts the TUI temporarily, runs `runSetupWizard()`, and remounts into the launcher. This pragmatic split avoids reimplementing readline-style prompts in Ink for v1.

**Files:**
- Create: `src/cli/tui/screens/first-run.tsx`
- Test: `tests/cli/tui/screens/first-run.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/screens/first-run.test.tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { FirstRun } from "../../../../src/cli/tui/screens/first-run.js";

describe("FirstRun screen — auth pick step", () => {
  it("renders both auth options", () => {
    const { lastFrame } = render(
      <FirstRun onAuthPicked={() => {}} />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("Claude subscription");
    expect(out).toContain("API key");
  });

  it("emits onAuthPicked('subscription') when subscription selected", () => {
    let picked: string | undefined;
    const { stdin } = render(
      <FirstRun onAuthPicked={(mode) => { picked = mode; }} />,
    );
    stdin.write("\r"); // enter on first item
    expect(picked).toBe("subscription");
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/screens/first-run.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/cli/tui/screens/first-run.tsx`**

```tsx
import React from "react";
import { Box, Text } from "ink";
import { Menu, type MenuItem } from "../components/menu.js";
import { type AuthMode } from "../store/auth.js";

export interface FirstRunProps {
  onAuthPicked: (mode: AuthMode) => void;
}

export function FirstRun({ onAuthPicked }: FirstRunProps): React.ReactElement {
  const items: MenuItem[] = [
    {
      id: "subscription",
      label: "Claude subscription (recommended)",
      detail: "wraps `claude /login`",
    },
    {
      id: "api-key",
      label: "API key",
      detail: "use ANTHROPIC_API_KEY or prompt",
    },
  ];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">Welcome to Niato</Text>
      <Text color="gray">First run — let's pick your auth path.</Text>
      <Box marginTop={1}>
        <Menu
          items={items}
          onSelect={(id) => onAuthPicked(id as AuthMode)}
        />
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Note: subscription auth wraps your existing Claude Code login. ToS
          considerations apply — see README "Note on subscription auth".
        </Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
pnpm test tests/cli/tui/screens/first-run.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/screens/first-run.tsx tests/cli/tui/screens/first-run.test.tsx
git commit -m "feat(tui): FirstRun screen — auth-pick step"
```

---

## Task 17: App shell (`tui/app.tsx`)

Glues screens to the screen-stack. Holds the auth+companion bootstrap, plus the post-auth wizard hand-off. This is **integration**, not new logic — most of the work is wiring.

**Files:**
- Create: `src/cli/tui/app.tsx`
- Test: `tests/cli/tui/app.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui/app.test.tsx
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import { App } from "../../../src/cli/tui/app.js";
import { type Companion } from "../../../src/cli/companion-config.js";
import { makeStubNiato } from "./_helpers/stub-niato.js";

const companion: Companion = {
  version: 1, name: "Arienz", voice: "warm", createdAt: "2026-04-28T00:00:00Z",
};

function setupCompanionFile(dir: string): string {
  const p = join(dir, "companion.json");
  writeFileSync(p, `${JSON.stringify(companion, null, 2)}\n`);
  return p;
}

describe("App shell", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "niato-app-"));
    mkdirSync(join(root, "sessions"), { recursive: true });
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("companion present → opens on launcher", () => {
    const companionPath = setupCompanionFile(root);
    const { lastFrame } = render(
      <App
        companionPath={companionPath}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        niatoFactory={() => makeStubNiato([])}
        version="0.0.0-test"
      />,
    );
    expect(lastFrame()).toContain("New session");
  });

  it("companion missing → opens on first-run", () => {
    const { lastFrame } = render(
      <App
        companionPath={join(root, "missing.json")}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        niatoFactory={() => makeStubNiato([])}
        version="0.0.0-test"
      />,
    );
    expect(lastFrame()).toContain("Welcome to Niato");
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test tests/cli/tui/app.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/cli/tui/app.tsx`**

```tsx
import React, { useState } from "react";
import { Box, Text, useApp } from "ink";
import { randomUUID } from "node:crypto";
import { useScreenStack } from "./hooks/use-screen-stack.js";
import { Launcher, type LauncherChoice } from "./screens/launcher.js";
import { Session } from "./screens/session.js";
import { Settings } from "./screens/settings.js";
import { About } from "./screens/about.js";
import { FirstRun } from "./screens/first-run.js";
import { Menu } from "./components/menu.js";
import {
  loadCompanion,
  defaultCompanionPath,
  type Companion,
} from "../companion-config.js";
import {
  loadAuth,
  resolveAuth,
  saveAuth,
  defaultAuthPath,
  type AuthMode,
  type AuthState,
} from "./store/auth.js";
import {
  loadMostRecent,
  defaultSessionsDir,
  pruneSessions,
  type SessionMode,
} from "./store/sessions.js";
import { type Niato } from "../../core/compose.js";
import { type Logger } from "../../observability/log.js";

export interface AppProps {
  companionPath?: string;
  sessionsDir?: string;
  authPath?: string;
  niatoFactory: (logger: Logger) => Niato;
  version: string;
}

export function App({
  companionPath = defaultCompanionPath(),
  sessionsDir = defaultSessionsDir(),
  authPath = defaultAuthPath(),
  niatoFactory,
  version,
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const [companion, setCompanion] = useState<Companion | null>(() => loadCompanion(companionPath));
  const [auth, setAuth] = useState<AuthState | null>(() => loadAuth(authPath));

  // Best-effort prune on cold start. Errors are silent; user-facing.
  React.useEffect(() => {
    try { pruneSessions(50, sessionsDir); } catch { /* ignore */ }
  }, [sessionsDir]);

  const initialScreen = companion === null ? "first-run" : "launcher";
  const stack = useScreenStack({ name: initialScreen, props: {} });

  const recent = loadMostRecent(sessionsDir);
  const hasResumable = recent !== null;

  const onLauncherSelect = (choice: LauncherChoice): void => {
    if (companion === null) return;
    if (choice === "new") {
      // Per spec Q2: mode is picked per-session at start. Push the
      // mode-prompt screen, which on selection replaces itself with
      // the session screen carrying the chosen mode.
      stack.push("mode-prompt", {});
    } else if (choice === "resume" && recent !== null) {
      stack.push("session", {
        sessionId: recent.sessionId,
        mode: recent.mode,
        replayedTurns: recent.turns.map((t) => ({
          input: t.input,
          output: t.output,
          classification: t.classification,
          trace: t.trace,
          phase: "done" as const,
        })),
      });
    } else if (choice === "settings") {
      stack.push("settings", {});
    } else if (choice === "about") {
      stack.push("about", {});
    } else {
      exit();
    }
  };

  const onAuthPicked = (mode: AuthMode): void => {
    if (mode === "subscription") {
      saveAuth({ mode: "subscription" }, authPath);
      setAuth({ mode: "subscription" });
    } else {
      const env = process.env["ANTHROPIC_API_KEY"];
      const next: AuthState = { mode: "api-key", ...(typeof env === "string" && env.length > 0 ? { apiKey: env } : {}) };
      saveAuth(next, authPath);
      setAuth(next);
    }
    // Companion wizard hand-off: implementation plan defers Ink-native wizard
    // to v1.x. For v1, after auth is picked, app exits with a console hint
    // for the user to run the existing readline-based wizard. Replace this
    // block once the Ink wizard ships.
    if (loadCompanion(companionPath) === null) {
      // eslint-disable-next-line no-console
      console.log("\nAuth saved. Run `pnpm chat` once to set up your companion, then `niato` again.\n");
      exit();
      return;
    }
    setCompanion(loadCompanion(companionPath));
    stack.replace("launcher", {});
  };

  const screen = stack.current;
  if (screen.name === "first-run") {
    return <FirstRun onAuthPicked={onAuthPicked} />;
  }
  if (screen.name === "launcher" && companion !== null) {
    return <Launcher companion={companion} hasResumable={hasResumable} onSelect={onLauncherSelect} />;
  }
  if (screen.name === "settings" && companion !== null) {
    return (
      <Settings
        companion={companion}
        auth={auth}
        onBack={stack.pop}
        onResetCompanion={() => {
          // eslint-disable-next-line no-console
          console.log("\nRun `pnpm chat --reset` to re-run the companion wizard.\n");
          exit();
        }}
        onResetAuth={() => {
          stack.replace("first-run", {});
        }}
      />
    );
  }
  if (screen.name === "about") {
    return <About version={version} onBack={stack.pop} />;
  }
  if (screen.name === "mode-prompt") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="cyan">Mode for this session?</Text>
        <Box marginTop={1}>
          <Menu
            items={[
              { id: "casual", label: "Casual", detail: "warm; observability minimal" },
              { id: "dev", label: "Dev", detail: "expanded footer; full trace" },
            ]}
            onSelect={(id) => {
              stack.replace("session", {
                sessionId: randomUUID(),
                mode: id as SessionMode,
                replayedTurns: [],
              });
            }}
            onCancel={stack.pop}
          />
        </Box>
      </Box>
    );
  }
  if (screen.name === "session" && companion !== null) {
    const props = screen.props as {
      sessionId: string;
      mode: SessionMode;
      replayedTurns: import("./hooks/use-niato-session.js").TurnState[];
    };
    return (
      <Session
        companion={companion}
        mode={props.mode}
        sessionId={props.sessionId}
        sessionsDir={sessionsDir}
        niatoFactory={niatoFactory}
        replayedTurns={props.replayedTurns}
        onExit={stack.pop}
      />
    );
  }
  // unreachable; resolveAuth used to silence unused warning
  void resolveAuth;
  return <></>;
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
pnpm test tests/cli/tui/app.test.tsx
```

Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/cli/tui/app.tsx tests/cli/tui/app.test.tsx
git commit -m "feat(tui): App shell — wires auth/companion bootstrap + screen-stack"
```

---

## Task 18: Entry point (`tui/index.tsx`)

**Files:**
- Create: `src/cli/tui/index.tsx`

- [ ] **Step 1: Implement `src/cli/tui/index.tsx`**

(No new behavioral logic — just construct dependencies and render. The smoke test in Task 20 validates this end-to-end.)

```tsx
import React from "react";
import { render } from "ink";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { App } from "./app.js";
import { createNiato } from "../../core/compose.js";
import { genericPack } from "../../packs/generic/index.js";
import { supportPack } from "../../packs/support/index.js";
import { devToolsPack } from "../../packs/dev-tools/index.js";
import { buildPersonaFromCompanion } from "../persona-builder.js";
import { loadCompanion } from "../companion-config.js";
import { type Logger } from "../../observability/log.js";

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "..", "..", "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function main(): Promise<void> {
  const version = readVersion();
  const companion = loadCompanion();

  const niatoFactory = (logger: Logger): ReturnType<typeof createNiato> =>
    createNiato({
      packs: [genericPack, supportPack, devToolsPack],
      logger,
      ...(companion !== null ? { persona: buildPersonaFromCompanion(companion) } : {}),
    });

  const { waitUntilExit } = render(
    <App niatoFactory={niatoFactory} version={version} />,
  );
  await waitUntilExit();
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(message);
  process.exit(1);
});
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Manual smoke (optional, helpful)**

```bash
pnpm exec tsx --env-file=.env src/cli/tui/index.tsx
```

Expected: launcher renders. Press `q` to quit.

- [ ] **Step 4: Commit**

```bash
git add src/cli/tui/index.tsx
git commit -m "feat(tui): entry point — index.tsx renders App with all packs"
```

---

## Task 19: Wire `package.json` script + `bin/niato` default

**Files:**
- Modify: `package.json`
- Modify: `bin/niato`

- [ ] **Step 1: Add `tui` script to `package.json`**

In the `"scripts"` block, add:

```json
"tui": "tsx --env-file=.env src/cli/tui/index.tsx",
```

The full scripts block becomes (the new line is `tui`):

```json
"scripts": {
  "dev": "tsx --env-file=.env src/cli.ts",
  "dev:multi": "tsx --env-file=.env src/cli-multi.ts",
  "dev:tui": "tsx --env-file=.env src/cli-tui.tsx",
  "tui": "tsx --env-file=.env src/cli/tui/index.tsx",
  "chat": "tsx --env-file=.env src/cli-chat.ts",
  "login": "tsx src/cli-login.ts",
  "build": "tsc -p tsconfig.build.json",
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "test": "vitest run",
  "test:watch": "vitest",
  "eval": "tsx --env-file=.env src/evals/runner.ts"
}
```

- [ ] **Step 2: Update `bin/niato` default subcommand**

Change the `set -- chat` line to `set -- tui`. The full file becomes:

```sh
#!/usr/bin/env sh
# Niato CLI dispatcher.
#
# Routes subcommands through pnpm to the matching script in package.json.
# Defaults to `tui` when invoked with no args. Forwards any extra args
# through, so `niato chat --reset` becomes `pnpm chat --reset`.
#
# Setup (one-time): `pnpm link` from the repo root, then `niato login`
# and `niato` (launches TUI) are available globally.

set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ $# -eq 0 ]; then
  set -- tui
fi

exec pnpm --silent --dir "$DIR" "$@"
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
pnpm lint
```

Expected: PASS for both.

- [ ] **Step 4: Commit**

```bash
git add package.json bin/niato
git commit -m "feat(cli): niato defaults to TUI; chat subcommand kept as legacy alias"
```

---

## Task 20: End-to-end smoke test

**Files:**
- Create: `tests/cli/tui-smoke.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/tui-smoke.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import { App } from "../../src/cli/tui/app.js";
import { type Companion } from "../../src/cli/companion-config.js";
import { makeStubNiato } from "./tui/_helpers/stub-niato.js";

describe("TUI end-to-end smoke", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "niato-smoke-"));
    mkdirSync(join(root, "sessions"), { recursive: true });
    const companion: Companion = {
      version: 1, name: "Arienz", voice: "warm", createdAt: "2026-04-28T00:00:00Z",
    };
    writeFileSync(join(root, "companion.json"), `${JSON.stringify(companion)}\n`);
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("launcher → New session → submit one turn → see output → JSONL written", async () => {
    const { stdin, lastFrame, rerender } = render(
      <App
        companionPath={join(root, "companion.json")}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        niatoFactory={() => makeStubNiato([{ output: "the answer is 42" }])}
        version="0.0.0-smoke"
      />,
    );

    // launcher visible
    expect(lastFrame()).toContain("New session");

    // hit enter on the first item (New session) → opens mode-prompt
    stdin.write("\r");
    rerender(
      <App
        companionPath={join(root, "companion.json")}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        niatoFactory={() => makeStubNiato([{ output: "the answer is 42" }])}
        version="0.0.0-smoke"
      />,
    );
    expect(lastFrame()).toContain("Mode for this session?");

    // hit enter on the first item (Casual) → opens session
    stdin.write("\r");
    rerender(
      <App
        companionPath={join(root, "companion.json")}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        niatoFactory={() => makeStubNiato([{ output: "the answer is 42" }])}
        version="0.0.0-smoke"
      />,
    );
    expect(lastFrame()).toMatch(/casual|session/);

    // type a message and submit
    stdin.write("what is the answer?");
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 50));
    rerender(
      <App
        companionPath={join(root, "companion.json")}
        sessionsDir={join(root, "sessions")}
        authPath={join(root, "auth.json")}
        niatoFactory={() => makeStubNiato([{ output: "the answer is 42" }])}
        version="0.0.0-smoke"
      />,
    );

    expect(lastFrame()).toContain("the answer is 42");

    // a JSONL file should now exist
    const sessions = require("node:fs").readdirSync(join(root, "sessions")) as string[];
    expect(sessions.length).toBe(1);
    const file = join(root, "sessions", sessions[0]!);
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    // session-start + 1 turn
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const turnLine = JSON.parse(lines[1]!) as { input: string; output: string };
    expect(turnLine.input).toBe("what is the answer?");
    expect(turnLine.output).toBe("the answer is 42");
    expect(existsSync(file)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify PASS**

(All implementation already exists — this test is the integration check.)

```bash
pnpm test tests/cli/tui-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the full suite**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: ALL GREEN.

- [ ] **Step 4: Commit**

```bash
git add tests/cli/tui-smoke.test.ts
git commit -m "test(tui): end-to-end smoke — launcher → session → JSONL written"
```

---

## Task 21: README updates

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a TUI section**

In `README.md`, after the existing "Quickstart" section (or in a sensible place near the top), add:

```markdown
## TUI (end-user terminal app)

Niato ships with a polished terminal UI for end-user use. After installing
globally:

```bash
pnpm link
niato          # launches the TUI
niato login    # OAuth subscription auth (wraps `claude /login`)
niato chat     # legacy multi-turn REPL (kept for backwards compat)
```

**First run** walks you through:

1. Auth pick — Claude subscription (recommended) or API key.
2. Companion setup — name, voice, optional preferences (saved to `~/.niato/companion.json`).

**The TUI gives you:**

- A launcher with **New session**, **Resume last**, **Settings**, **About**.
- Per-session mode pick (casual / dev) — same engine, different observability density.
- Always-visible thin footer showing classify/dispatch ticks, latency, cost.
- Sessions persisted as JSONL at `~/.niato/sessions/{id}.jsonl` (last 50 retained).

**Headless paths still work:** `echo "hi" | pnpm dev` and `pnpm dev "hi"` remain
unchanged for scripting.
```

- [ ] **Step 2: Verify markdown renders**

```bash
# Visually inspect; no test runner for prose.
cat README.md | head -120
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README — add TUI section for end-user surface"
```

---

## Final verification

After all 21 tasks ship, run the gauntlet:

- [ ] `pnpm typecheck` — green
- [ ] `pnpm lint` — green
- [ ] `pnpm test` — all green (component, screen, store, hook, app, smoke)
- [ ] Manual: `pnpm tui` — launcher renders, New session works, submitting a turn writes JSONL, esc → back to launcher, q → quit cleanly.
- [ ] Manual: `echo "hello" | pnpm dev` — single-shot still works (regression check).
- [ ] Manual: `pnpm chat` — legacy REPL still works.

Then:
- [ ] Open a PR titled `feat(tui): end-user TUI v1`.
- [ ] PR body links the spec and this plan.
- [ ] Tag the release per existing semver convention.

---

## Notes for the executor

- **Parallelism opportunity:** Tasks 6, 7, 10, 11 (low-level components) are independent of each other. If using subagent-driven execution, dispatch 2–4 of these in parallel after Task 5 completes.
- **Tasks 8 & 9** (`PhaseLine` and `TokenPanel` extraction) can also run in parallel with each other but **must** complete before Task 10 (Footer reuses tick semantics from PhaseLine and Task 17 wires everything).
- **Task 16's wizard hand-off** is intentionally pragmatic: the v1 first-run lands a hint to run `pnpm chat` once for the companion wizard. A native Ink wizard (replacing the readline path) is documented as v1.x work — out of scope for this plan.
- **Don't add ink-router or ink-ui.** The custom screen-stack is by design.
- **Don't touch `cli-tui.tsx`** beyond the import-only edits in Tasks 8 and 9. Its retirement is post-v1.

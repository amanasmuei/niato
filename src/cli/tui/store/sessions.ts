import {
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
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

export interface SessionErrorLine {
  v: 1;
  type: "error";
  input: string;
  errorMessage: string;
  ts: string;
}

export type SessionLine =
  | SessionStartLine
  | SessionTurnLine
  | SessionErrorLine;

export interface LoadedSession {
  sessionId: string;
  mode: SessionMode;
  createdAt: string;
  turns: (SessionTurnLine | SessionErrorLine)[];
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

function isSessionLine(value: unknown): value is SessionLine {
  if (typeof value !== "object" || value === null) return false;
  // Cast to read the `type` discriminator off an unknown object literal.
  const t = (value as Record<string, unknown>)["type"];
  return t === "session-start" || t === "turn" || t === "error";
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

export function appendError(
  sessionId: string,
  input: string,
  errorMessage: string,
  dir: string = defaultSessionsDir(),
): void {
  ensureDir(dir);
  const line: SessionErrorLine = {
    v: 1,
    type: "error",
    input,
    errorMessage,
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
  const turns: (SessionTurnLine | SessionErrorLine)[] = [];
  for (const raw of lines) {
    try {
      const obj: unknown = JSON.parse(raw);
      if (!isSessionLine(obj)) continue;
      if (obj.type === "session-start") {
        mode = obj.mode;
        createdAt = obj.createdAt;
      } else {
        // Narrowed to SessionTurnLine | SessionErrorLine — both go into turns.
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
  const [first] = listRecentSessions(dir);
  if (first === undefined) return null;
  return loadSession(first.sessionId, dir);
}

export function pruneSessions(
  maxKeep = 50,
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

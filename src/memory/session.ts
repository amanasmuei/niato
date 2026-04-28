import { randomUUID } from "node:crypto";
import {
  emptySessionMetrics,
  type SessionMetrics,
} from "../observability/metrics.js";

export interface SessionContext {
  id: string;
  createdAt: Date;
  turnCount: number;
  cumulativeCostUsd: number;
  // Phase 7: rolling per-session aggregates (turn count, cumulative cost,
  // latency, hook denial counts, dispatch counts, error count). Mutated
  // by updateSessionMetrics in compose.run() after every turn settles.
  metrics: SessionMetrics;
}

// Phase 1 in-memory store. Real long-term memory arrives in a later phase;
// see ARCHITECTURE.md §9.
export class InMemorySessionStore {
  private readonly sessions = new Map<string, SessionContext>();

  getOrCreate(id?: string): SessionContext {
    if (id !== undefined) {
      const existing = this.sessions.get(id);
      if (existing) return existing;
    }
    const session: SessionContext = {
      id: id ?? randomUUID(),
      createdAt: new Date(),
      turnCount: 0,
      cumulativeCostUsd: 0,
      metrics: emptySessionMetrics(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): SessionContext | undefined {
    return this.sessions.get(id);
  }

  touch(id: string): void {
    const session = this.sessions.get(id);
    if (session) session.turnCount += 1;
  }
}

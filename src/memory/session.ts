import { randomUUID } from "node:crypto";
import {
  emptySessionMetrics,
  type SessionMetrics,
} from "../observability/metrics.js";

// Phase 8 cleanup: turnCount and cumulativeCostUsd previously lived as
// top-level fields here AND inside metrics — kept in sync by two separate
// lines of compose.run(). Consolidated to the metrics ledger so a future
// contributor can't update one path and silently break the other.
export interface SessionContext {
  id: string;
  createdAt: Date;
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
      metrics: emptySessionMetrics(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): SessionContext | undefined {
    return this.sessions.get(id);
  }
}

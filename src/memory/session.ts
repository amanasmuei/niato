import { randomUUID } from "node:crypto";

export interface SessionContext {
  id: string;
  createdAt: Date;
  turnCount: number;
  cumulativeCostUsd: number;
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
    };
    this.sessions.set(session.id, session);
    return session;
  }

  touch(id: string): void {
    const session = this.sessions.get(id);
    if (session) session.turnCount += 1;
  }
}

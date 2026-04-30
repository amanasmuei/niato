import { describe, it, expect } from "vitest";
import { InMemorySessionStore } from "../src/memory/session.js";

describe("InMemorySessionStore", () => {
  it("creates a new session with started=false", () => {
    const store = new InMemorySessionStore();
    const s = store.getOrCreate();
    expect(s.started).toBe(false);
  });

  it("getOrCreate returns the same session by id, preserving started state", () => {
    const store = new InMemorySessionStore();
    const a = store.getOrCreate();
    a.started = true;
    const b = store.getOrCreate(a.id);
    expect(b).toBe(a);
    expect(b.started).toBe(true);
  });

  it("creates a fresh session for a new id", () => {
    const store = new InMemorySessionStore();
    const a = store.getOrCreate();
    const b = store.getOrCreate("00000000-0000-0000-0000-000000000000");
    expect(b.id).not.toBe(a.id);
    expect(b.started).toBe(false);
  });
});

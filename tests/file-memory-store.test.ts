import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyFactCap,
  buildMemoryPreamble,
  emptyMemoryRecord,
  FileMemoryStore,
  LongTermMemoryRecordSchema,
  loadOrInitMemory,
  MAX_FACTS,
  MAX_FACTS_TEXT_BYTES,
} from "../src/memory/long-term.js";

let baseDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "niato-memory-test-"));
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe("FileMemoryStore", () => {
  it("returns undefined when the user has no file yet", async () => {
    const store = new FileMemoryStore({ baseDir });
    expect(await store.read("brand-new-user")).toBeUndefined();
  });

  it("write + read round-trip preserves the record", async () => {
    const store = new FileMemoryStore({ baseDir });
    const record = {
      version: 1 as const,
      facts: ["fact one", "fact two"],
      updatedAt: "2026-05-01T00:00:00.000Z",
    };
    await store.write("user-a", record);
    const read = await store.read("user-a");
    expect(read).toEqual(record);
  });

  it("creates the file at <baseDir>/<userId>.json", async () => {
    const store = new FileMemoryStore({ baseDir });
    await store.write("alice", emptyMemoryRecord());
    const expected = join(baseDir, "alice.json");
    const onDisk: unknown = JSON.parse(readFileSync(expected, "utf8"));
    expect(LongTermMemoryRecordSchema.safeParse(onDisk).success).toBe(true);
  });

  it("creates the baseDir lazily on first write", async () => {
    const nested = join(baseDir, "nested", "deeper");
    const store = new FileMemoryStore({ baseDir: nested });
    // Confirm pre-write the directory does not exist (read returns
    // undefined rather than crashing on the missing dir).
    expect(await store.read("u")).toBeUndefined();
    await store.write("u", emptyMemoryRecord());
    expect(await store.read("u")).toBeDefined();
  });

  it("rejects malformed JSON with a clear error", async () => {
    const store = new FileMemoryStore({ baseDir });
    writeFileSync(join(baseDir, "u.json"), "{not json", "utf8");
    await expect(store.read("u")).rejects.toThrow(/malformed JSON/);
  });

  it("rejects schema mismatches on read", async () => {
    const store = new FileMemoryStore({ baseDir });
    writeFileSync(
      join(baseDir, "u.json"),
      JSON.stringify({ version: 99, facts: "not-an-array" }),
      "utf8",
    );
    await expect(store.read("u")).rejects.toThrow(/schema mismatch/);
  });

  it("rejects writing a record that fails the schema (defensive)", async () => {
    const store = new FileMemoryStore({ baseDir });
    // @ts-expect-error — deliberately bad input to verify validation
    await expect(store.write("u", { version: 2, facts: [] })).rejects.toThrow();
  });

  it("sanitizes user ids with path separators", () => {
    const store = new FileMemoryStore({ baseDir });
    const path = store.pathFor("../etc/passwd");
    // Sanitization replaces "/" and "." separators that could escape baseDir;
    // the resolved path stays inside baseDir.
    expect(path.startsWith(baseDir)).toBe(true);
    expect(path).not.toContain("/etc/");
  });
});

describe("loadOrInitMemory", () => {
  it("returns an empty record when the store has no entry", async () => {
    const store = new FileMemoryStore({ baseDir });
    const record = await loadOrInitMemory(store, "fresh-user");
    expect(record.version).toBe(1);
    expect(record.facts).toEqual([]);
    expect(typeof record.updatedAt).toBe("string");
  });

  it("returns the existing record when present", async () => {
    const store = new FileMemoryStore({ baseDir });
    await store.write("alice", {
      version: 1,
      facts: ["she likes tea"],
      updatedAt: "2026-05-01T00:00:00.000Z",
    });
    const record = await loadOrInitMemory(store, "alice");
    expect(record.facts).toEqual(["she likes tea"]);
  });
});

describe("applyFactCap", () => {
  it("does nothing when under both caps", () => {
    const facts = ["a", "b", "c"];
    expect(applyFactCap(facts)).toEqual({ facts, dropped: 0 });
  });

  it("drops oldest above MAX_FACTS, keeping the newest", () => {
    const facts = Array.from(
      { length: MAX_FACTS + 5 },
      (_, i) => `f${String(i)}`,
    );
    const { facts: capped, dropped } = applyFactCap(facts);
    expect(capped.length).toBe(MAX_FACTS);
    expect(dropped).toBe(5);
    expect(capped[0]).toBe("f5");
    expect(capped[MAX_FACTS - 1]).toBe(`f${String(MAX_FACTS + 4)}`);
  });

  it("drops oldest until text byte budget fits", () => {
    // Each fact is 100 bytes; 50 of them = 5_000 > 4_096.
    const fact = "x".repeat(100);
    const facts = Array.from({ length: 50 }, () => fact);
    const { facts: capped, dropped } = applyFactCap(facts);
    expect(dropped).toBeGreaterThan(0);
    const bytes = Buffer.byteLength(capped.join("\n"), "utf8");
    expect(bytes).toBeLessThanOrEqual(MAX_FACTS_TEXT_BYTES);
  });
});

describe("buildMemoryPreamble", () => {
  it("returns empty string for empty facts (opt-in by presence)", () => {
    expect(buildMemoryPreamble([])).toBe("");
  });

  it("renders facts as a bullet list and ends with a section break", () => {
    const out = buildMemoryPreamble(["fact one", "fact two"]);
    expect(out).toContain("- fact one");
    expect(out).toContain("- fact two");
    expect(out.endsWith("---\n\n")).toBe(true);
  });

  it("trims whitespace and skips blank facts", () => {
    const out = buildMemoryPreamble(["  fact  ", "", "  ", "real fact"]);
    expect(out).toContain("- fact");
    expect(out).toContain("- real fact");
    // Only bullet lines start with "- " (the "---" separator does not).
    expect(out.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(2);
  });
});

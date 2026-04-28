import { describe, it, expect } from "vitest";
import {
  __supportStubHandlers,
  SUPPORT_STUB_SERVER_NAME,
  SupportStubTools,
  supportStubServer,
} from "../src/packs/support/tools/support_stub.js";

// The MCP transport is non-trivial to spin up in unit tests; the handlers
// don't depend on it, so we exercise them directly via __supportStubHandlers.
// E2E coverage of the full SDK round-trip lands in the Phase 4 smoke test.

function textOf(result: { content: { type: string; text?: string }[] }): string {
  const block = result.content[0];
  if (block?.type !== "text" || block.text === undefined) {
    throw new Error("expected a text content block");
  }
  return block.text;
}

describe("support_stub MCP server", () => {
  it("declares the documented server name", () => {
    expect(SUPPORT_STUB_SERVER_NAME).toBe("support_stub");
    expect(supportStubServer.type).toBe("sdk");
  });

  it("exposes the four tool name constants under the mcp__ prefix", () => {
    expect(SupportStubTools).toEqual({
      lookup_ticket: "mcp__support_stub__lookup_ticket",
      search_kb: "mcp__support_stub__search_kb",
      issue_refund: "mcp__support_stub__issue_refund",
      create_priority_ticket: "mcp__support_stub__create_priority_ticket",
    });
  });
});

describe("lookup_ticket handler", () => {
  it("returns a structured response for a TKT- prefixed ID", async () => {
    const result = await __supportStubHandlers.lookup_ticket(
      { ticket_id: "TKT-12345" },
      undefined,
    );
    const body = textOf(result);
    expect(body).toContain("TKT-12345");
    expect(body).toMatch(/Customer:/);
    expect(body).toMatch(/Created:/);
  });

  it("returns a not-found message for non-TKT IDs", async () => {
    const result = await __supportStubHandlers.lookup_ticket(
      { ticket_id: "ORDER-9999" },
      undefined,
    );
    expect(textOf(result)).toMatch(/not found/i);
  });

  it("is deterministic for the same ticket_id", async () => {
    const a = textOf(
      await __supportStubHandlers.lookup_ticket(
        { ticket_id: "TKT-AAAA" },
        undefined,
      ),
    );
    const b = textOf(
      await __supportStubHandlers.lookup_ticket(
        { ticket_id: "TKT-AAAA" },
        undefined,
      ),
    );
    expect(a).toBe(b);
  });
});

describe("search_kb handler", () => {
  it("returns three KB results for any query", async () => {
    const result = await __supportStubHandlers.search_kb(
      { query: "How do refunds work?" },
      undefined,
    );
    const body = textOf(result);
    expect(body).toMatch(/Refund policy/);
    expect(body).toMatch(/charges appear/);
    expect(body).toMatch(/account email/);
  });
});

describe("issue_refund handler", () => {
  it("issues a refund and reports the amount/order back", async () => {
    const result = await __supportStubHandlers.issue_refund(
      { order_id: "ORD-12345", amount_usd: 19.5, reason: "wrong size" },
      undefined,
    );
    const body = textOf(result);
    expect(body).toMatch(/Refund ID: RF-/);
    expect(body).toContain("ORD-12345");
    expect(body).toContain("$19.50");
    expect(body).toContain("wrong size");
  });

  // The handler itself does NOT enforce the dollar threshold — that's the
  // dollar-limit hook's job (Phase 4 Step 4). The handler runs only when the
  // hook has already approved.
  it("does not gate by dollar amount on its own", async () => {
    const result = await __supportStubHandlers.issue_refund(
      { order_id: "ORD-1", amount_usd: 99999, reason: "no questions asked" },
      undefined,
    );
    expect(textOf(result)).toMatch(/Refund ID: RF-/);
  });
});

describe("create_priority_ticket handler", () => {
  it("pages on-call only when severity is high AND page_oncall is true", async () => {
    const lowNoPage = await __supportStubHandlers.create_priority_ticket(
      { severity: "low", summary: "minor cosmetic bug", page_oncall: true },
      undefined,
    );
    expect(textOf(lowNoPage)).toContain("Paged on-call: no");

    const highWithPage = await __supportStubHandlers.create_priority_ticket(
      {
        severity: "high",
        summary: "production outage",
        page_oncall: true,
      },
      undefined,
    );
    expect(textOf(highWithPage)).toContain("Paged on-call: yes");

    const highWithoutPage = await __supportStubHandlers.create_priority_ticket(
      { severity: "high", summary: "outage but eng aware", page_oncall: false },
      undefined,
    );
    expect(textOf(highWithoutPage)).toContain("Paged on-call: no");
  });
});

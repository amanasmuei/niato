import { describe, it, expect } from "vitest";
import { classifyError } from "../src/cli/error-classify.js";
import { NiatoAuthError } from "../src/core/errors.js";

describe("classifyError", () => {
  it("returns null for unrecognized errors", () => {
    expect(classifyError(new Error("totally generic error"))).toBeNull();
    expect(classifyError("string thrown")).toBeNull();
    expect(classifyError(undefined)).toBeNull();
    expect(classifyError(null)).toBeNull();
  });

  it("classifies a NiatoAuthError as auth", () => {
    const result = classifyError(new NiatoAuthError("No auth configured"));
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("auth");
    expect(result?.message).toContain("No auth configured");
  });

  it("classifies 401 as auth-expired", () => {
    const cases = [
      new Error("401 Unauthorized"),
      new Error("Authentication failed: 401"),
      new Error("Request failed with status 401"),
    ];
    for (const err of cases) {
      const result = classifyError(err);
      expect(result?.kind).toBe("auth-expired");
      expect(result?.message).toMatch(/auth|re-authenticate|expired/i);
    }
  });

  it("classifies 429 as rate-limit", () => {
    const cases = [
      new Error("429 Too Many Requests"),
      new Error("rate_limit_exceeded"),
      new Error("Anthropic rate limit hit, retry after 60s"),
    ];
    for (const err of cases) {
      const result = classifyError(err);
      expect(result?.kind).toBe("rate-limit");
      expect(result?.message).toMatch(/rate limit|wait|try again/i);
    }
  });

  it("classifies network failures as network", () => {
    const cases = [
      new Error("fetch failed"),
      new Error("ECONNREFUSED 127.0.0.1:443"),
      new Error("getaddrinfo ENOTFOUND api.anthropic.com"),
      new Error("network request failed"),
    ];
    for (const err of cases) {
      const result = classifyError(err);
      expect(result?.kind).toBe("network");
      expect(result?.message).toMatch(/connection|network|reach/i);
    }
  });

  it("classifies zod parse errors as malformed-response", () => {
    const cases = [
      new Error("Invalid intent classification: ZodError: Required"),
      new Error("zod parse failed: expected string"),
    ];
    for (const err of cases) {
      const result = classifyError(err);
      expect(result?.kind).toBe("malformed-response");
      expect(result?.message).toMatch(/unexpected|response|try again/i);
    }
  });
});

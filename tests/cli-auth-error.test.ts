import { describe, it, expect } from "vitest";
import { renderAuthError } from "../src/cli-error-render.js";
import { NiatoAuthError } from "../src/core/errors.js";

describe("renderAuthError", () => {
  it("returns the error message for NiatoAuthError", () => {
    const err = new NiatoAuthError(
      "No authentication configured.\nPick one:\n  * foo\n",
    );
    const out = renderAuthError(err);
    expect(out).not.toBeNull();
    expect(out).toContain("No authentication configured");
    expect(out).toContain("Pick one");
    expect(out).not.toContain("at "); // no stack trace
    expect(out).toMatch(/^niato: /);
  });

  it("returns null for non-auth errors", () => {
    expect(renderAuthError(new Error("something else"))).toBeNull();
    expect(renderAuthError("string thrown")).toBeNull();
    expect(renderAuthError(undefined)).toBeNull();
  });
});

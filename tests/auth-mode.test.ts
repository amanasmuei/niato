import { describe, it, expect } from "vitest";
import { loadConfig, resolveAuthMode } from "../src/core/config.js";
import { NiatoAuthError } from "../src/core/errors.js";

describe("resolveAuthMode (v0.2 opt-in gate)", () => {
  it("returns 'api_key' when ANTHROPIC_API_KEY is set", () => {
    const cfg = loadConfig({ ANTHROPIC_API_KEY: "sk-test" });
    expect(resolveAuthMode(cfg)).toBe("api_key");
  });

  it("returns 'oauth_subscription' when NIATO_AUTH=subscription", () => {
    const cfg = loadConfig({ NIATO_AUTH: "subscription" });
    expect(resolveAuthMode(cfg)).toBe("oauth_subscription");
  });

  it("returns 'oauth_token' when CLAUDE_CODE_OAUTH_TOKEN is set", () => {
    const cfg = loadConfig({ CLAUDE_CODE_OAUTH_TOKEN: "ct-abc" });
    expect(resolveAuthMode(cfg)).toBe("oauth_token");
  });

  it("prefers NIATO_AUTH=subscription over ANTHROPIC_API_KEY when both set", () => {
    const cfg = loadConfig({
      ANTHROPIC_API_KEY: "sk-test",
      NIATO_AUTH: "subscription",
    });
    expect(resolveAuthMode(cfg)).toBe("oauth_subscription");
  });

  // Priority: CLAUDE_CODE_OAUTH_TOKEN is the most specific credential — it
  // IS the auth value, not a flag — so it wins over both the subscription
  // flag and the API-key path. This matches the SDK's own treatment in
  // sdk.mjs, which checks both env vars in parallel without a documented
  // preference; niato picks the more-specific one for deterministic logs.
  it("prefers CLAUDE_CODE_OAUTH_TOKEN over ANTHROPIC_API_KEY when both set", () => {
    const cfg = loadConfig({
      ANTHROPIC_API_KEY: "sk-test",
      CLAUDE_CODE_OAUTH_TOKEN: "ct-abc",
    });
    expect(resolveAuthMode(cfg)).toBe("oauth_token");
  });

  it("prefers CLAUDE_CODE_OAUTH_TOKEN over NIATO_AUTH=subscription", () => {
    const cfg = loadConfig({
      NIATO_AUTH: "subscription",
      CLAUDE_CODE_OAUTH_TOKEN: "ct-abc",
    });
    expect(resolveAuthMode(cfg)).toBe("oauth_token");
  });

  it("token wins over all three when set together", () => {
    const cfg = loadConfig({
      ANTHROPIC_API_KEY: "sk-test",
      NIATO_AUTH: "subscription",
      CLAUDE_CODE_OAUTH_TOKEN: "ct-abc",
    });
    expect(resolveAuthMode(cfg)).toBe("oauth_token");
  });

  it("throws NiatoAuthError naming all three options when none are set", () => {
    const cfg = loadConfig({});
    let caught: unknown;
    try {
      resolveAuthMode(cfg);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(NiatoAuthError);
    if (caught instanceof NiatoAuthError) {
      expect(caught.message).toContain("ANTHROPIC_API_KEY");
      expect(caught.message).toContain("NIATO_AUTH=subscription");
      expect(caught.message).toContain("CLAUDE_CODE_OAUTH_TOKEN");
    }
  });

  it("loadConfig rejects unknown NIATO_AUTH values at the schema layer", () => {
    // zod's literal('subscription') surfaces the typo at config-load time
    // instead of falling through to a misleading 'no auth configured' error.
    expect(() => loadConfig({ NIATO_AUTH: "subsciption" })).toThrow();
  });
});

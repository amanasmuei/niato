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

  it("prefers NIATO_AUTH=subscription over ANTHROPIC_API_KEY when both set", () => {
    const cfg = loadConfig({
      ANTHROPIC_API_KEY: "sk-test",
      NIATO_AUTH: "subscription",
    });
    expect(resolveAuthMode(cfg)).toBe("oauth_subscription");
  });

  it("throws NiatoAuthError with actionable message when neither is set", () => {
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
    }
  });

  it("loadConfig rejects unknown NIATO_AUTH values at the schema layer", () => {
    // zod's literal('subscription') surfaces the typo at config-load time
    // instead of falling through to a misleading 'no auth configured' error.
    expect(() => loadConfig({ NIATO_AUTH: "subsciption" })).toThrow();
  });
});

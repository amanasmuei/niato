import { describe, it, expect } from "vitest";
import { loadConfig, resolveAuthMode } from "../src/core/config.js";
import { NawaituAuthError } from "../src/core/errors.js";

describe("resolveAuthMode (v0.2 opt-in gate)", () => {
  it("returns 'api_key' when ANTHROPIC_API_KEY is set", () => {
    const cfg = loadConfig({ ANTHROPIC_API_KEY: "sk-test" });
    expect(resolveAuthMode(cfg, {})).toBe("api_key");
  });

  it("returns 'oauth_subscription' when NAWAITU_AUTH=subscription", () => {
    const cfg = loadConfig({});
    expect(resolveAuthMode(cfg, { NAWAITU_AUTH: "subscription" })).toBe(
      "oauth_subscription",
    );
  });

  it("prefers NAWAITU_AUTH=subscription over ANTHROPIC_API_KEY when both set", () => {
    const cfg = loadConfig({ ANTHROPIC_API_KEY: "sk-test" });
    expect(resolveAuthMode(cfg, { NAWAITU_AUTH: "subscription" })).toBe(
      "oauth_subscription",
    );
  });

  it("throws NawaituAuthError with actionable message when neither is set", () => {
    const cfg = loadConfig({});
    expect(() => resolveAuthMode(cfg, {})).toThrow(NawaituAuthError);
    try {
      resolveAuthMode(cfg, {});
    } catch (err) {
      expect(err).toBeInstanceOf(NawaituAuthError);
      const msg = (err as NawaituAuthError).message;
      expect(msg).toContain("ANTHROPIC_API_KEY");
      expect(msg).toContain("NAWAITU_AUTH=subscription");
    }
  });

  it("ignores unknown NAWAITU_AUTH values and falls through to api_key/error path", () => {
    const cfg = loadConfig({ ANTHROPIC_API_KEY: "sk-test" });
    expect(resolveAuthMode(cfg, { NAWAITU_AUTH: "garbage" })).toBe("api_key");

    const empty = loadConfig({});
    expect(() => resolveAuthMode(empty, { NAWAITU_AUTH: "garbage" })).toThrow(
      NawaituAuthError,
    );
  });
});

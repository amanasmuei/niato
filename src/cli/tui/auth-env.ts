import { existsSync } from "node:fs";
import { defaultAuthPath, loadAuth } from "./store/auth.js";

// Bridges the TUI's persisted auth choice to the orchestrator's
// schema-validated auth resolution (src/core/config.ts:resolveAuthMode).
// Called once at TUI startup, before niatoFactory is invoked.
//
// Two modes, two env-var bridges:
//   subscription → sets NIATO_AUTH=subscription (Agent SDK takes the
//                  OAuth path against ~/.claude/ session storage).
//   api-key      → sets ANTHROPIC_API_KEY from the file. Closes the
//                  v1.2.0 latent bug where in-app key entry persisted
//                  the file but never bridged to env, so next launch's
//                  resolveAuthMode threw "no auth configured."
//
// Pre-existing env values always win — explicit shell config beats
// persisted UI choice. The two checks are independent so a leftover
// shell value in one slot doesn't block bridging the other.
export function applyPersistedAuthEnv(authPath?: string): void {
  const persisted = loadAuth(authPath);
  if (persisted === null) return;

  if (persisted.mode === "subscription") {
    const explicit = process.env["NIATO_AUTH"];
    if (typeof explicit === "string" && explicit.length > 0) return;
    process.env["NIATO_AUTH"] = "subscription";
    return;
  }

  // TS narrows persisted.mode to "api-key" here; AuthSchema is a closed
  // discriminated union of the two members.
  const existing = process.env["ANTHROPIC_API_KEY"];
  if (typeof existing === "string" && existing.length > 0) return;
  process.env["ANTHROPIC_API_KEY"] = persisted.apiKey;
}

// Boolean predicate used by the TUI's initial-screen gate: is ANY auth
// path configured (file OR env var)? Mirrors resolveAuthMode's set of
// recognized inputs without throwing — gating wants a yes/no, not the
// chosen mode. Without this, users who set CLAUDE_CODE_OAUTH_TOKEN or
// ANTHROPIC_API_KEY in their shell would be unnecessarily routed
// through first-run, then back out, on every launch.
export function isAuthConfigured(authPath?: string): boolean {
  const env = process.env;
  const tok = env["CLAUDE_CODE_OAUTH_TOKEN"];
  if (typeof tok === "string" && tok.length > 0) return true;
  const ah = env["NIATO_AUTH"];
  if (typeof ah === "string" && ah.length > 0) return true;
  const key = env["ANTHROPIC_API_KEY"];
  if (typeof key === "string" && key.length > 0) return true;
  return existsSync(authPath ?? defaultAuthPath());
}

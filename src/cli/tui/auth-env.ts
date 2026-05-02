import { existsSync } from "node:fs";
import { defaultAuthPath, loadAuth } from "./store/auth.js";

// Bridges the TUI's persisted auth choice to the orchestrator's
// schema-validated auth resolution (src/core/config.ts:resolveAuthMode).
// When the user picked the subscription path in first-run, we set
// NIATO_AUTH=subscription so the Agent SDK takes the OAuth path. Called
// once at TUI startup, before niatoFactory is invoked.
//
// Pre-existing NIATO_AUTH wins — explicit shell config beats persisted UI
// choice. api-key mode never sets the env: ANTHROPIC_API_KEY (set by the
// in-app key-entry flow in v0.3) carries that path on its own.
export function applyPersistedAuthEnv(authPath?: string): void {
  const explicit = process.env["NIATO_AUTH"];
  if (typeof explicit === "string" && explicit.length > 0) return;
  const persisted = loadAuth(authPath);
  if (persisted === null) return;
  if (persisted.mode === "subscription") {
    process.env["NIATO_AUTH"] = "subscription";
  }
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

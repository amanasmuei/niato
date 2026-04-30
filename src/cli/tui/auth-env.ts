import { loadAuth } from "./store/auth.js";

// Bridges the TUI's persisted auth choice to the orchestrator's
// schema-validated auth resolution (src/core/config.ts:resolveAuthMode).
// When the user picked the subscription path in first-run, we set
// NAWAITU_AUTH=subscription so the Agent SDK takes the OAuth path. Called
// once at TUI startup, before nawaituFactory is invoked.
//
// Pre-existing NAWAITU_AUTH wins — explicit shell config beats persisted UI
// choice. api-key mode never sets the env: ANTHROPIC_API_KEY (set by the
// in-app key-entry flow in v0.3) carries that path on its own.
export function applyPersistedAuthEnv(authPath?: string): void {
  if (typeof process.env["NAWAITU_AUTH"] === "string") return;
  const persisted = authPath !== undefined ? loadAuth(authPath) : loadAuth();
  if (persisted === null) return;
  if (persisted.mode === "subscription") {
    process.env["NAWAITU_AUTH"] = "subscription";
  }
}

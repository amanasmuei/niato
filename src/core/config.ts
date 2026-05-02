import { z } from "zod";
import { NiatoAuthError } from "./errors.js";

// Phase 9: ANTHROPIC_API_KEY is now optional. The Agent SDK resolves auth
// from either the env var (developer API path), Claude Code OAuth (Max
// subscription path), or a long-lived OAuth token (CI/headless path).
// resolveAuthMode() picks one at startup so the chosen path is logged
// unambiguously. The SDK itself recognizes both ANTHROPIC_API_KEY and
// CLAUDE_CODE_OAUTH_TOKEN natively (see sdk.mjs); niato exposes the same
// three paths so users can pick the right one for their environment.
const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  NIATO_AUTH: z.literal("subscription").optional(),
  // Long-lived OAuth token from `claude setup-token`. Designed for CI,
  // scripts, and headless environments where interactive browser login
  // isn't available. Read directly by the Agent SDK; niato just needs to
  // recognize it so resolveAuthMode doesn't throw "no auth configured."
  CLAUDE_CODE_OAUTH_TOKEN: z.string().min(1).optional(),
  NIATO_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // Tier 2 long-term memory: identifies which per-user fact file to load
  // from the configured MemoryStore. Resolution order at createNiato():
  // NiatoOptions.memory.userId → Config.NIATO_USER_ID → "default".
  // One Niato instance is one user (personal companion shape); userId
  // is NOT accepted per-turn on niato.run().
  NIATO_USER_ID: z.string().default("default"),
});

export type Config = z.infer<typeof EnvSchema>;

export type AuthMode = "api_key" | "oauth_subscription" | "oauth_token";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

// Resolve the auth path the Agent SDK will take. Three valid paths:
//
//   1. CLAUDE_CODE_OAUTH_TOKEN — long-lived OAuth token from
//      `claude setup-token` / `niato setup-token`. Designed for CI,
//      scripts, headless environments. SDK reads it natively.
//   2. NIATO_AUTH=subscription — opt-in OAuth subscription path via
//      ~/.claude/ session storage. Requires a prior `claude /login` /
//      `niato login`. ToS considerations apply for non-personal use;
//      see README "Note on subscription auth".
//   3. ANTHROPIC_API_KEY env var — developer API billing, per-token.
//
// Priority: token wins over flag wins over key. Token is the most
// specific credential (IS the auth value, not a hint), so when multiple
// are set we prefer it for deterministic logging. NIATO_AUTH=subscription
// beats ANTHROPIC_API_KEY because explicit subscription intent should not
// be silently overridden by a leftover developer API key. When NONE are
// set we throw rather than silently picking OAuth — that would push
// strangers onto the ToS-uncertain path without their knowledge.
export function resolveAuthMode(config: Config): AuthMode {
  if (config.CLAUDE_CODE_OAUTH_TOKEN !== undefined) return "oauth_token";
  if (config.NIATO_AUTH === "subscription") return "oauth_subscription";
  if (config.ANTHROPIC_API_KEY !== undefined) return "api_key";
  throw new NiatoAuthError(
    "No authentication configured.\n\n" +
      "Pick one:\n" +
      "  * `niato login` for interactive Claude subscription auth via\n" +
      "    OAuth (sets NIATO_AUTH=subscription; ToS notes in README).\n" +
      "  * `niato setup-token` for a long-lived token; export it as\n" +
      "    CLAUDE_CODE_OAUTH_TOKEN. Best for CI / headless.\n" +
      "  * Set ANTHROPIC_API_KEY for the developer API path (per-token billing).\n",
  );
}

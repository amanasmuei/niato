import { z } from "zod";
import { NawaituAuthError } from "./errors.js";

// Phase 9: ANTHROPIC_API_KEY is now optional. The Agent SDK resolves auth
// from either the env var (developer API path) or Claude Code OAuth (Max
// subscription path). Both paths are valid; resolveAuthMode() picks one
// at startup so the chosen path is logged unambiguously.
const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  NAWAITU_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof EnvSchema>;

export type AuthMode = "api_key" | "oauth_subscription";

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

// Resolve the auth path the Agent SDK will take. Two valid paths:
//
//   1. ANTHROPIC_API_KEY env var — developer API billing, per-token.
//   2. NAWAITU_AUTH=subscription — opt-in OAuth subscription path. Requires
//      a prior `claude /login`. ToS considerations apply for non-personal
//      use; see README "Note on subscription auth".
//
// Subscription opt-in wins when both are set: explicit intent beats default.
// When neither is set, we throw rather than silently landing on OAuth — that
// would push strangers onto the ToS-uncertain path without their knowledge.
export function resolveAuthMode(
  config: Config,
  env: NodeJS.ProcessEnv = process.env,
): AuthMode {
  if (env["NAWAITU_AUTH"] === "subscription") return "oauth_subscription";
  if (config.ANTHROPIC_API_KEY !== undefined) return "api_key";
  throw new NawaituAuthError(
    "No authentication configured.\n\n" +
      "Pick one:\n" +
      "  • Set ANTHROPIC_API_KEY (developer API path, per-token billing).\n" +
      "  • Set NAWAITU_AUTH=subscription to use Claude subscription auth\n" +
      "    (review ToS notes in README before non-personal use).\n",
  );
}

import { z } from "zod";

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

// Best-effort detection of the auth path the Agent SDK will take. The SDK
// itself does the actual resolution at query() time; this helper exists so
// startup can log the chosen mode and so the chat CLI can warn early when
// neither path is available.
export function resolveAuthMode(config: Config): AuthMode {
  if (config.ANTHROPIC_API_KEY !== undefined) return "api_key";
  return "oauth_subscription";
}

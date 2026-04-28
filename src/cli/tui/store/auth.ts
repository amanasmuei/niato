import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";

// Persisted auth configuration. Lives at ~/.nawaitu/auth.json by default,
// chmod 600. Resolution precedence at runtime: ANTHROPIC_API_KEY env var
// (when non-empty) > stored file > null. The discriminated-union schema
// enforces the invariant that api-key mode always carries a non-empty
// key — files that fail this check are treated as malformed and rejected,
// same shape as companion-config.ts.

export const AUTH_MODES = ["subscription", "api-key"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

export const AuthSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("subscription") }),
  z.object({ mode: z.literal("api-key"), apiKey: z.string().min(1) }),
]);

export type AuthState = z.infer<typeof AuthSchema>;

export function defaultAuthPath(): string {
  return join(homedir(), ".nawaitu", "auth.json");
}

// Returns null on missing file, malformed JSON, or schema-invalid content.
// All three failure modes are treated identically — caller re-runs setup.
export function loadAuth(path: string = defaultAuthPath()): AuthState | null {
  if (!existsSync(path)) return null;
  try {
    return AuthSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

export function saveAuth(
  state: AuthState,
  path: string = defaultAuthPath(),
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  chmodSync(path, 0o600);
}

export function resolveAuth(
  path: string = defaultAuthPath(),
): AuthState | null {
  const env = process.env["ANTHROPIC_API_KEY"];
  if (typeof env === "string" && env.length > 0) {
    return { mode: "api-key", apiKey: env };
  }
  return loadAuth(path);
}

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type AuthMode = "subscription" | "api-key";

export interface AuthState {
  mode: AuthMode;
  apiKey?: string;
}

export function defaultAuthPath(): string {
  return join(homedir(), ".nawaitu", "auth.json");
}

export function loadAuth(path: string = defaultAuthPath()): AuthState | null {
  if (!existsSync(path)) return null;
  try {
    // Cast: JSON.parse returns `any`; we narrow by inspecting fields below.
    const obj = JSON.parse(readFileSync(path, "utf8")) as Partial<AuthState>;
    if (obj.mode !== "subscription" && obj.mode !== "api-key") return null;
    if (obj.mode === "api-key") {
      return {
        mode: "api-key",
        ...(typeof obj.apiKey === "string" ? { apiKey: obj.apiKey } : {}),
      };
    }
    return { mode: "subscription" };
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

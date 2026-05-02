import { runLogin, defaultLoginIO } from "./cli/login.js";

async function main(): Promise<void> {
  const result = await runLogin(defaultLoginIO());
  if (!result.ok) process.exit(result.exitCode);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(msg);
  process.exit(1);
});

import { runSetupToken, defaultSetupTokenIO } from "./cli/setup-token.js";

async function main(): Promise<void> {
  const result = await runSetupToken(defaultSetupTokenIO());
  if (!result.ok) process.exit(result.exitCode);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(msg);
  process.exit(1);
});

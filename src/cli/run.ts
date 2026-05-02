import { type DomainPack } from "../packs/DomainPack.js";
import { createNiato } from "../core/compose.js";
import { applyPersistedAuthEnv } from "./tui/auth-env.js";

async function readStdinAll(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
    }
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

// Single-turn CLI loop shared by every `pnpm dev*` entry. Each entry decides
// which packs to load; the rest is identical.
export async function runCliOnce(
  packs: DomainPack[],
  usage: string,
): Promise<void> {
  // Bridge persisted ~/.niato/auth.json → process.env so resolveAuthMode
  // sees the user's prior `niato` first-run / `niato login` choice. The
  // TUI calls this in src/cli/tui/index.tsx; runCliOnce is the equivalent
  // entrypoint for `pnpm dev` / `pnpm dev:multi` and needs the same bridge.
  applyPersistedAuthEnv();

  const userInput =
    process.argv.slice(2).join(" ").trim() || (await readStdinAll());
  if (!userInput) {
    console.error(usage);
    process.exit(2);
  }

  const niato = createNiato({ packs });
  const turn = await niato.run(userInput);

  process.stdout.write(turn.result);
  process.stdout.write("\n");
}

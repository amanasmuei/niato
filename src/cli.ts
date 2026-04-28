import { createNawaitu } from "./core/compose.js";
import { genericPack } from "./packs/generic/index.js";

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

async function main(): Promise<void> {
  const userInput = process.argv.slice(2).join(" ").trim() || (await readStdinAll());
  if (!userInput) {
    console.error("usage: pnpm dev '<your question>'   |   echo '<input>' | pnpm dev");
    process.exit(2);
  }

  const nawaitu = createNawaitu({ packs: [genericPack] });
  const turn = await nawaitu.run(userInput);

  process.stdout.write(turn.result);
  process.stdout.write("\n");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(message);
  process.exit(1);
});

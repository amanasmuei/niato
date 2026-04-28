import { runCliOnce } from "./cli/run.js";
import { genericPack } from "./packs/generic/index.js";

const USAGE =
  "usage: pnpm dev '<your question>'   |   echo '<input>' | pnpm dev";

runCliOnce([genericPack], USAGE).catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(message);
  process.exit(1);
});

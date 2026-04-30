import { runCliOnce } from "./cli/run.js";
import { genericPack } from "./packs/generic/index.js";
import { renderAuthError } from "./cli-error-render.js";

const USAGE =
  "usage: pnpm dev '<your question>'   |   echo '<input>' | pnpm dev";

runCliOnce([genericPack], USAGE).catch((err: unknown) => {
  const authMessage = renderAuthError(err);
  if (authMessage !== null) {
    process.stderr.write(`${authMessage}\n`);
    process.exit(2);
    return;
  }
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(message);
  process.exit(1);
});

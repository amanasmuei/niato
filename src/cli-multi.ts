import { runCliOnce } from "./cli/run.js";
import { genericPack } from "./packs/generic/index.js";
import { supportPack } from "./packs/support/index.js";
import { devToolsPack } from "./packs/dev-tools/index.js";

// Multi-pack interactive CLI. Loads every shipped pack so single-domain
// prompts route correctly across all of them. Cross-pack composition
// (genuinely multi-domain queries) is still a Phase 6 deliverable.
const USAGE =
  "usage: pnpm dev:multi '<your question>'   |   echo '<input>' | pnpm dev:multi";

runCliOnce([genericPack, supportPack, devToolsPack], USAGE).catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(message);
  process.exit(1);
});

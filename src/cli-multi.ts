import { runCliOnce } from "./cli/run.js";
import { genericPack } from "./packs/generic/index.js";
import { supportPack } from "./packs/support/index.js";

// Multi-pack interactive CLI. Loads Generic + Support so refund / ticket /
// KB queries route correctly. Cross-pack composition itself is still a
// Phase 6 deliverable — this CLI is for poking at single-domain prompts
// while both packs are registered.
const USAGE =
  "usage: pnpm dev:multi '<your question>'   |   echo '<input>' | pnpm dev:multi";

runCliOnce([genericPack, supportPack], USAGE).catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(message);
  process.exit(1);
});

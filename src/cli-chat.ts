import { createNawaitu } from "./core/compose.js";
import { genericPack } from "./packs/generic/index.js";
import { supportPack } from "./packs/support/index.js";
import { devToolsPack } from "./packs/dev-tools/index.js";
import {
  defaultCompanionPath,
  loadCompanion,
  saveCompanion,
} from "./cli/companion-config.js";
import { runSetupWizard } from "./cli/setup-wizard.js";
import { buildPersonaFromCompanion } from "./cli/persona-builder.js";
import { runChatRepl } from "./cli/chat-repl.js";

// Persistent multi-turn chat entry point. First run launches the setup
// wizard and saves to ~/.nawaitu/companion.json; subsequent runs load
// the saved companion and drop straight into the REPL. Pass --reset to
// re-run the wizard.
async function main(): Promise<void> {
  const reset = process.argv.includes("--reset");
  const path = defaultCompanionPath();

  let companion = reset ? null : loadCompanion(path);
  if (companion === null) {
    if (reset) console.log("Resetting companion configuration.\n");
    companion = await runSetupWizard();
    saveCompanion(companion, path);
    console.log(`✓ Saved to ${path}\n`);
  }

  const persona = buildPersonaFromCompanion(companion);
  const nawaitu = createNawaitu({
    packs: [genericPack, supportPack, devToolsPack],
    persona,
  });

  await runChatRepl(nawaitu, companion);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(msg);
  process.exit(1);
});

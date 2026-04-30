import React from "react";
import { render } from "ink";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { App } from "./app.js";
import { createNawaitu, type Nawaitu } from "../../core/compose.js";
import { genericPack } from "../../packs/generic/index.js";
import { supportPack } from "../../packs/support/index.js";
import { devToolsPack } from "../../packs/dev-tools/index.js";
import { buildPersonaFromCompanion } from "../persona-builder.js";
import { loadCompanion } from "../companion-config.js";
import { type Logger } from "../../observability/log.js";
import { applyPersistedAuthEnv } from "./auth-env.js";
import { renderAuthError } from "../../cli-error-render.js";

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // Source path: src/cli/tui/index.tsx → ../../.. lands at project root.
    // Built path: dist/cli/tui/index.js → ../../.. also lands at project
    // root, so the same `..` count works for both source (tsx) and build.
    const pkgPath = join(here, "..", "..", "..", "package.json");
    // Cast: package.json is JSON-parsed; we only read `version` defensively
    // and fall back to "0.0.0" if absent or unparseable.
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function main(): Promise<void> {
  applyPersistedAuthEnv();
  const version = readVersion();
  const companion = loadCompanion();

  const nawaituFactory = (logger: Logger): Nawaitu =>
    createNawaitu({
      packs: [genericPack, supportPack, devToolsPack],
      logger,
      ...(companion !== null
        ? { persona: buildPersonaFromCompanion(companion) }
        : {}),
    });

  const { waitUntilExit } = render(
    <App nawaituFactory={nawaituFactory} version={version} />,
  );
  await waitUntilExit();
}

main().catch((err: unknown) => {
  const authMessage = renderAuthError(err);
  if (authMessage !== null) {
    process.stderr.write(`${authMessage}\n`);
    process.exit(2);
    return;
  }
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(message);
  process.exit(1);
});

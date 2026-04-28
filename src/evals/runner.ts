import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadConfig } from "../core/config.js";
import {
  createHaikuClassifier,
  type HaikuClassifierOptions,
} from "../core/classifier/haiku.js";
import { type Classifier } from "../core/classifier/types.js";
import { genericPack } from "../packs/generic/index.js";
import { supportPack } from "../packs/support/index.js";
import { devToolsPack } from "../packs/dev-tools/index.js";
import {
  runGenericEvals,
  type EvalReport,
} from "../packs/generic/evals/runEvals.js";
import { runSupportEvals } from "../packs/support/evals/runEvals.js";
import { runDevToolsEvals } from "../packs/dev-tools/evals/runEvals.js";
import { type DomainPack } from "../packs/DomainPack.js";
import {
  checkAgainstBaseline,
  readBaseline,
  writeBaseline,
} from "./baseline.js";

interface PackEvalSpec {
  pack: DomainPack;
  threshold: number;
  total: number;
  run: (classifier: Classifier) => Promise<EvalReport>;
  // Default per-pack baseline path (next to cases.jsonl, per pack-owns-
  // its-evals convention). Overridable via --baseline=<path>.
  defaultBaselinePath: string;
}

const here = dirname(fileURLToPath(import.meta.url));

function packEvalsDir(packDir: string): string {
  return resolve(here, "..", "packs", packDir, "evals", "baseline.json");
}

const PACKS: Record<string, PackEvalSpec> = {
  generic: {
    pack: genericPack,
    threshold: 18,
    total: 20,
    run: runGenericEvals,
    defaultBaselinePath: packEvalsDir("generic"),
  },
  support: {
    pack: supportPack,
    threshold: 22,
    total: 25,
    run: runSupportEvals,
    defaultBaselinePath: packEvalsDir("support"),
  },
  dev_tools: {
    pack: devToolsPack,
    threshold: 22,
    total: 25,
    run: runDevToolsEvals,
    defaultBaselinePath: packEvalsDir("dev-tools"),
  },
};

interface CliFlags {
  baseline: boolean;
  baselinePath: string | undefined;
  writeBaseline: boolean;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    baseline: false,
    baselinePath: undefined,
    writeBaseline: false,
  };
  for (const arg of argv) {
    if (arg === "--baseline") {
      flags.baseline = true;
    } else if (arg.startsWith("--baseline=")) {
      flags.baseline = true;
      flags.baselinePath = arg.slice("--baseline=".length);
    } else if (arg === "--write-baseline") {
      flags.writeBaseline = true;
    }
  }
  return flags;
}

function printFailures(report: EvalReport): void {
  const failures = report.results.filter((r) => !r.passed);
  if (failures.length === 0) return;
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  - input: ${JSON.stringify(f.case.input)}`);
    console.log(`    expected: ${JSON.stringify(f.case.expected)}`);
    console.log(`    actual:   ${JSON.stringify(f.actual)}`);
    if (f.case.notes !== undefined) {
      console.log(`    notes:    ${f.case.notes}`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const packName = args[0];
  if (!packName || packName.startsWith("--")) {
    console.error(
      `usage: pnpm eval <${Object.keys(PACKS).join("|")}> [--baseline[=<path>]] [--write-baseline]`,
    );
    process.exit(2);
  }

  const spec = PACKS[packName];
  if (!spec) {
    console.error(
      `Unknown pack: ${packName}. Available: ${Object.keys(PACKS).join(", ")}`,
    );
    process.exit(2);
  }

  const flags = parseFlags(args.slice(1));
  const baselinePath = flags.baselinePath ?? spec.defaultBaselinePath;

  const config = loadConfig();
  const classifierOptions: HaikuClassifierOptions = {
    packs: [spec.pack],
    apiKey: config.ANTHROPIC_API_KEY,
  };
  const classifier = createHaikuClassifier(classifierOptions);

  console.log(`Running evals for pack: ${packName}`);
  const report = await spec.run(classifier);

  console.log(
    `\nResults: ${String(report.passed)}/${String(report.total)} passed`,
  );
  printFailures(report);

  if (report.passed < spec.threshold) {
    console.error(
      `\nPass threshold not met: ${String(report.passed)}/${String(report.total)} (required ≥ ${String(spec.threshold)})`,
    );
    process.exit(1);
  }
  console.log(
    `\nPass threshold met (≥ ${String(spec.threshold)}/${String(report.total)}).`,
  );

  if (flags.writeBaseline) {
    const written = writeBaseline(baselinePath, report);
    console.log(
      `\nBaseline written to ${baselinePath}: ${String(written.passed)}/${String(written.total)} (${written.timestamp}).`,
    );
    return;
  }

  if (flags.baseline) {
    const baseline = readBaseline(baselinePath);
    if (baseline === null) {
      console.error(
        `\nBaseline check requested but no baseline at ${baselinePath}. Run \`pnpm eval ${packName} --write-baseline\` first.`,
      );
      process.exit(1);
    }
    const check = checkAgainstBaseline(report, baseline);
    if (!check.ok) {
      console.error(`\nBaseline check failed: ${String(check.reason)}`);
      process.exit(1);
    }
    console.log(
      `\nBaseline check passed: ${String(report.passed)}/${String(report.total)} ≥ ${String(baseline.passed)}/${String(baseline.total)} (recorded ${baseline.timestamp}).`,
    );
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(msg);
  process.exit(1);
});

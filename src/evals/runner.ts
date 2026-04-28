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

interface PackEvalSpec {
  pack: DomainPack;
  threshold: number;
  total: number;
  run: (classifier: Classifier) => Promise<EvalReport>;
}

const PACKS: Record<string, PackEvalSpec> = {
  generic: {
    pack: genericPack,
    threshold: 18,
    total: 20,
    run: runGenericEvals,
  },
  support: {
    pack: supportPack,
    threshold: 22,
    total: 25,
    run: runSupportEvals,
  },
  dev_tools: {
    pack: devToolsPack,
    threshold: 22,
    total: 25,
    run: runDevToolsEvals,
  },
};

async function main(): Promise<void> {
  const packName = process.argv[2];
  if (!packName) {
    console.error(`usage: pnpm eval <${Object.keys(PACKS).join("|")}>`);
    process.exit(2);
  }

  const spec = PACKS[packName];
  if (!spec) {
    console.error(
      `Unknown pack: ${packName}. Available: ${Object.keys(PACKS).join(", ")}`,
    );
    process.exit(2);
  }

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
  const failures = report.results.filter((r) => !r.passed);
  if (failures.length > 0) {
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

  if (report.passed < spec.threshold) {
    console.error(
      `\nPass threshold not met: ${String(report.passed)}/${String(report.total)} (required ≥ ${String(spec.threshold)})`,
    );
    process.exit(1);
  }
  console.log(
    `\nPass threshold met (≥ ${String(spec.threshold)}/${String(report.total)}).`,
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(msg);
  process.exit(1);
});

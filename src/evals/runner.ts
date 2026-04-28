import { loadConfig } from "../core/config.js";
import { createHaikuClassifier } from "../core/classifier/haiku.js";
import { genericPack } from "../packs/generic/index.js";
import { runGenericEvals, type EvalReport } from "../packs/generic/evals/runEvals.js";

const PASS_THRESHOLD = 18; // ≥ 90% of 20 cases

async function main(): Promise<void> {
  const packName = process.argv[2];
  if (!packName) {
    console.error("usage: pnpm eval <pack-name>");
    process.exit(2);
  }

  const config = loadConfig();
  const classifier = createHaikuClassifier({
    packs: [genericPack],
    apiKey: config.ANTHROPIC_API_KEY,
  });

  let report: EvalReport;
  switch (packName) {
    case "generic":
      console.log(`Running evals for pack: ${packName}`);
      report = await runGenericEvals(classifier);
      break;
    default:
      console.error(
        `Unknown pack: ${packName}. Phase 2 only supports 'generic'.`,
      );
      process.exit(2);
  }

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

  if (report.passed < PASS_THRESHOLD) {
    console.error(
      `\nPass threshold not met: ${String(report.passed)}/${String(report.total)} (required ≥ ${String(PASS_THRESHOLD)})`,
    );
    process.exit(1);
  }
  console.log(
    `\nPass threshold met (≥ ${String(PASS_THRESHOLD)}/${String(report.total)}).`,
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(msg);
  process.exit(1);
});

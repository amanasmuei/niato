import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { type Classifier } from "../../../core/classifier/types.js";
import {
  runPackEvals,
  type EvalReport,
} from "../../../evals/runPackEvals.js";

const casesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "cases.jsonl",
);

export function runDevToolsEvals(
  classifier: Classifier,
): Promise<EvalReport> {
  return runPackEvals({ casesPath, classifier });
}

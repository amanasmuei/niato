import { describe, expect, it } from "vitest";
import { createHaikuClassifier } from "../src/core/classifier/haiku.js";
import { devToolsPack, genericPack, supportPack } from "../src/index.js";
import { type IntentResult } from "../src/core/classifier/types.js";

// Phase 6 cross-pack classifier evals. Validates that Haiku correctly
// distinguishes "this user message touches multiple packs" from "this is
// one pack with multiple specialists". Loads all three packs together so
// the classifier sees the full vocabulary at once.
//
// Per-case pass criterion:
//   - multi-domain: primary (domain, intent) correct AND `secondary` is
//     non-empty.
//   - single-domain: primary (domain, intent) correct AND `secondary` is
//     undefined or empty (i.e. classifier did NOT speculatively split).
//
// Threshold: 7 of 8 cases pass. One slot of slack for genuinely ambiguous
// inputs where either reading is defensible.

const apiKey = process.env["ANTHROPIC_API_KEY"];

interface CrossPackCase {
  input: string;
  expectedPrimary: { domain: string; intent: string };
  multiDomain: boolean;
  notes?: string;
}

const CASES: CrossPackCase[] = [
  {
    input:
      "The refund webhook is broken — find the bug and open a ticket for the on-call engineer.",
    expectedPrimary: { domain: "dev_tools", intent: "fix_bug" },
    multiDomain: true,
    notes:
      "Architecture §7.4 textbook example. Primary is the bug-fix; secondary should land in support.",
  },
  {
    input:
      "What's the status of order ORD-99? And explain how DNS works while you're at it.",
    expectedPrimary: { domain: "support", intent: "order_status" },
    multiDomain: true,
    notes:
      "Two unrelated asks in one turn — should fan out across support + generic.",
  },
  {
    input:
      "Refund \$15 on order ORD-1 because the duplicate charge looks like a CI deploy bug — please debug the CI as well.",
    expectedPrimary: { domain: "support", intent: "refund_request" },
    multiDomain: true,
    notes:
      "Refund is the user-facing primary; the CI debug is a real secondary in dev_tools.",
  },
  {
    input:
      "Find where the OAuth callback handler lives and also cancel my account.",
    expectedPrimary: { domain: "dev_tools", intent: "find_code" },
    multiDomain: true,
    notes: "Cross-pack: code search + support account_help.",
  },
  // ---------- single-domain controls (no split) ----------
  {
    input: "Find the bug in the auth handler and patch it.",
    expectedPrimary: { domain: "dev_tools", intent: "fix_bug" },
    multiDomain: false,
    notes:
      "Two dev_tools verbs (find + fix) — should NOT split into find_code + fix_bug.",
  },
  {
    input: "I want a refund AND I want to talk to a manager about this.",
    expectedPrimary: { domain: "support", intent: "complaint" },
    multiDomain: false,
    notes:
      "Two support intents collapsed — same pack, no cross-pack secondary.",
  },
  {
    input: "What is 2 + 2?",
    expectedPrimary: { domain: "generic", intent: "question" },
    multiDomain: false,
    notes: "Trivial single-domain.",
  },
  {
    input:
      "Where is the rate limiter implemented? Show me the file path.",
    expectedPrimary: { domain: "dev_tools", intent: "find_code" },
    multiDomain: false,
    notes: "Single dev_tools intent.",
  },
];

describe.skipIf(!apiKey)("cross-pack classifier evals", () => {
  it("scores at least 7/8 of the multi-domain detection cases correctly", async () => {
    const classifier = createHaikuClassifier({
      packs: [genericPack, supportPack, devToolsPack],
      apiKey: apiKey ?? "",
    });

    interface RunResult {
      case: CrossPackCase;
      actual: IntentResult;
      passed: boolean;
      reason?: string;
    }

    const results: RunResult[] = [];
    for (const c of CASES) {
      const actual = await classifier.classify(c.input);
      const primaryOk =
        actual.domain === c.expectedPrimary.domain &&
        actual.intent === c.expectedPrimary.intent;
      const secondaryCount = actual.secondary?.length ?? 0;
      const multiOk = c.multiDomain
        ? secondaryCount > 0
        : secondaryCount === 0;
      const passed = primaryOk && multiOk;
      results.push({
        case: c,
        actual,
        passed,
        ...(passed
          ? {}
          : {
              reason: !primaryOk
                ? `primary (${actual.domain}, ${actual.intent}) ≠ expected (${c.expectedPrimary.domain}, ${c.expectedPrimary.intent})`
                : c.multiDomain
                  ? "expected secondary classifications, got none"
                  : `expected no secondary, got ${String(secondaryCount)}`,
            }),
      });
    }

    const passed = results.filter((r) => r.passed).length;
    if (passed < 7) {
      const failures = results
        .filter((r) => !r.passed)
        .map(
          (f) =>
            `  - ${JSON.stringify(f.case.input)} → ${String(f.reason)}`,
        )
        .join("\n");
      throw new Error(
        `Cross-pack classifier pass rate ${String(passed)}/${String(results.length)} below threshold (7). Failures:\n${failures}`,
      );
    }
    expect(passed).toBeGreaterThanOrEqual(7);
    expect(results.length).toBe(8);
  }, 300_000);
});

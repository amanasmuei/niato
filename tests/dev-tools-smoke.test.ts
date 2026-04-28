import { describe, expect, it } from "vitest";
import {
  createNawaitu,
  devToolsPack,
  extractAgentDispatches,
} from "../src/index.js";

// Phase 5 end-to-end smoke for the Dev Tools pack. Three live turns:
//   1. find_code  → codebase_search dispatches and returns a file path.
//   2. explain_code → code_explainer dispatches against a known file.
//   3. fix_bug   → bug_fixer dispatches; sandboxBashHook denies a non-test
//                  command; the deny reason text appears in the message
//                  stream. (Tighter than Phase 4's loose deny smoke per
//                  the post-Phase-4 advisor feedback.)
//
// Each turn costs ~$0.05–0.10. Total ~$0.25. Skipped without the API key.
const hasKey = Boolean(process.env["ANTHROPIC_API_KEY"]);

function messageStreamContains(
  messages: readonly unknown[],
  needle: string,
): boolean {
  return messages.some((m) => JSON.stringify(m).includes(needle));
}

describe.skipIf(!hasKey)("smoke: Dev Tools pack end-to-end", () => {
  it("dispatches dev_tools.codebase_search for a find_code query", async () => {
    const nawaitu = createNawaitu({ packs: [devToolsPack] });
    const turn = await nawaitu.run(
      "Where is the agentOnlyOrchestratorHook defined?",
    );

    const dispatches = extractAgentDispatches(turn.messages);
    expect(dispatches).toContain("dev_tools.codebase_search");
    expect(turn.classification.intent).toBe("find_code");
    expect(turn.trace.outcome).toBe("success");
    expect(turn.result).toMatch(/orchestrator-enforcement\.ts/);
  }, 240_000);

  it("dispatches dev_tools.code_explainer for an explain_code query", async () => {
    const nawaitu = createNawaitu({ packs: [devToolsPack] });
    const turn = await nawaitu.run(
      "Explain what agentOnlyOrchestratorHook does in src/guardrails/orchestrator-enforcement.ts.",
    );

    const dispatches = extractAgentDispatches(turn.messages);
    expect(dispatches).toContain("dev_tools.code_explainer");
    expect(turn.classification.intent).toBe("explain_code");
    expect(turn.trace.outcome).toBe("success");
  }, 240_000);

  it("denies a non-allowlist Bash command via sandboxBashHook and surfaces the reason", async () => {
    const nawaitu = createNawaitu({ packs: [devToolsPack] });
    const turn = await nawaitu.run(
      "There's a bug somewhere in src/index.ts that's causing build failures. Investigate by running `git log -3 --oneline` to see recent commits, then read the file and propose a one-line fix.",
    );

    expect(turn.classification.intent).toBe("fix_bug");
    expect(turn.trace.outcome).toBe("success");
    const dispatches = extractAgentDispatches(turn.messages);
    expect(dispatches).toContain("dev_tools.bug_fixer");
    // The sandbox denies the git command; the deny reason text shows up
    // in the SDK's tool-result stream as the model's view of what
    // happened. Confirms the hook fired through the SDK round-trip, not
    // just in isolation.
    expect(
      messageStreamContains(turn.messages, "test-runner allowlist"),
    ).toBe(true);
  }, 240_000);
});

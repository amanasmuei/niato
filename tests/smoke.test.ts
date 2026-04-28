import { describe, expect, it } from "vitest";
import {
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { createNawaitu, genericPack } from "../src/index.js";

// Phase 1 end-to-end smoke test. Hits the real Anthropic API; only runs
// when ANTHROPIC_API_KEY is set. Costs a small number of tokens per run.
const hasKey = Boolean(process.env["ANTHROPIC_API_KEY"]);

interface ToolUseBlockShape {
  type: string;
  name: string;
  input: { subagent_type?: unknown };
}

function isToolUseBlock(block: unknown): block is ToolUseBlockShape {
  if (typeof block !== "object" || block === null) return false;
  const b = block as Record<string, unknown>;
  return (
    b["type"] === "tool_use" &&
    typeof b["name"] === "string" &&
    typeof b["input"] === "object" &&
    b["input"] !== null
  );
}

function findAgentDispatches(messages: SDKMessage[]): string[] {
  const dispatches: string[] = [];
  for (const msg of messages) {
    if (msg.type !== "assistant") continue;
    const content: unknown = msg.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!isToolUseBlock(block)) continue;
      // The dispatch tool was renamed Task → Agent in v2.1.63; both names
      // can appear depending on SDK version.
      if (block.name !== "Agent" && block.name !== "Task") continue;
      const subagentType = block.input.subagent_type;
      if (typeof subagentType === "string") dispatches.push(subagentType);
    }
  }
  return dispatches;
}

describe.skipIf(!hasKey)("smoke: end-to-end loop", () => {
  it("dispatches generic.retrieval for a question", async () => {
    const nawaitu = createNawaitu({ packs: [genericPack] });
    const turn = await nawaitu.run("what is 2+2");

    const dispatches = findAgentDispatches(turn.messages);
    expect(dispatches, "expected at least one Agent dispatch").not.toHaveLength(
      0,
    );
    expect(dispatches).toContain("generic.retrieval");
    expect(turn.result).toBeTruthy();
    expect(turn.classification).toEqual({
      intent: "question",
      domain: "generic",
      confidence: 0.95,
    });
  }, 120_000);
});

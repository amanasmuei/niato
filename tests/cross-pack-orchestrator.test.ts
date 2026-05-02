import { describe, expect, it } from "vitest";
import { devToolsPack, genericPack, supportPack } from "../src/index.js";
import {
  buildUserMessage,
  pickAdditionalRecommendations,
} from "../src/core/orchestrator/orchestrator.js";
import { type IntentResult } from "../src/core/classifier/types.js";

const allPacks = [genericPack, supportPack, devToolsPack];

function withClassification(classification: IntentResult) {
  return {
    userInput: "test input",
    classification,
    packs: allPacks,
  };
}

describe("pickAdditionalRecommendations", () => {
  it("returns an empty array when there is no secondary classification", () => {
    const out = pickAdditionalRecommendations(
      withClassification({
        intent: "fix_bug",
        domain: "dev_tools",
        confidence: 0.9,
      }),
    );
    expect(out).toEqual([]);
  });

  it("resolves a single cross-pack secondary into <pack>.<specialist>", () => {
    const out = pickAdditionalRecommendations(
      withClassification({
        intent: "fix_bug",
        domain: "dev_tools",
        confidence: 0.93,
        secondary: [
          { intent: "complaint", domain: "support", confidence: 0.88 },
        ],
      }),
    );
    expect(out).toEqual([
      { specialist: "support.escalate", confidence: 0.88 },
    ]);
  });

  it("preserves the secondary order across multiple entries", () => {
    const out = pickAdditionalRecommendations(
      withClassification({
        intent: "find_code",
        domain: "dev_tools",
        confidence: 0.9,
        secondary: [
          { intent: "complaint", domain: "support", confidence: 0.9 },
          { intent: "question", domain: "generic", confidence: 0.86 },
        ],
      }),
    );
    expect(out.map((a) => a.specialist)).toEqual([
      "support.escalate",
      "generic.retrieval",
    ]);
  });

  it("drops secondary entries whose domain is not loaded", () => {
    const out = pickAdditionalRecommendations(
      withClassification({
        intent: "fix_bug",
        domain: "dev_tools",
        confidence: 0.9,
        secondary: [
          { intent: "anything", domain: "billing", confidence: 0.9 },
        ],
      }),
    );
    expect(out).toEqual([]);
  });

  it("drops secondary entries whose intent the pack router rejects", () => {
    const out = pickAdditionalRecommendations(
      withClassification({
        intent: "fix_bug",
        domain: "dev_tools",
        confidence: 0.9,
        secondary: [
          // dev_tools doesn't ship a `merge_pr` intent — only create_pr.
          { intent: "merge_pr", domain: "dev_tools", confidence: 0.9 },
        ],
      }),
    );
    expect(out).toEqual([]);
  });

  it("deduplicates a secondary that resolves to the primary specialist", () => {
    const out = pickAdditionalRecommendations(
      withClassification({
        intent: "fix_bug",
        domain: "dev_tools",
        confidence: 0.9,
        secondary: [
          { intent: "fix_bug", domain: "dev_tools", confidence: 0.9 },
        ],
      }),
    );
    expect(out).toEqual([]);
  });
});

describe("buildUserMessage", () => {
  it("omits the Additional recommendations block when there is no secondary", () => {
    const msg = buildUserMessage(
      withClassification({
        intent: "question",
        domain: "generic",
        confidence: 0.95,
      }),
    );
    expect(msg).toContain("Recommended specialist: generic.retrieval");
    expect(msg).not.toContain("Additional recommendations:");
  });

  it("includes the Additional recommendations block with confidences", () => {
    const msg = buildUserMessage(
      withClassification({
        intent: "fix_bug",
        domain: "dev_tools",
        confidence: 0.93,
        secondary: [
          { intent: "complaint", domain: "support", confidence: 0.88 },
        ],
      }),
    );
    expect(msg).toContain("Recommended specialist: dev_tools.bug_fixer");
    expect(msg).toContain("Additional recommendations:");
    expect(msg).toContain("- support.escalate (confidence 0.88)");
  });
});

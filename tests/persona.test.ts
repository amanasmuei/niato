import { describe, expect, it } from "vitest";
import { buildPersonaPreamble, type Persona } from "../src/index.js";
import { buildOrchestratorSystemPrompt } from "../src/core/orchestrator/orchestrator.js";

describe("buildPersonaPreamble", () => {
  it("returns empty string when no persona is set (backward compat)", () => {
    expect(buildPersonaPreamble(undefined)).toBe("");
  });

  it("renders name + description with a section break", () => {
    const persona: Persona = {
      name: "Layla",
      description: "Warm, faith-aware companion. Address the user by name.",
    };
    const out = buildPersonaPreamble(persona);
    expect(out).toContain("You are Layla.");
    expect(out).toContain("Warm, faith-aware companion.");
    expect(out.endsWith("---\n\n")).toBe(true);
  });

  it("renders description only when name is omitted", () => {
    const out = buildPersonaPreamble({
      description: "Terse, technical. No greetings.",
    });
    expect(out).not.toContain("You are");
    expect(out).toContain("Terse, technical. No greetings.");
    expect(out.endsWith("---\n\n")).toBe(true);
  });

  it("trims leading/trailing whitespace in description", () => {
    const out = buildPersonaPreamble({
      description: "\n\n  Trim me.  \n\n",
    });
    expect(out).toContain("Trim me.");
    expect(out).not.toMatch(/^\s+Trim/);
  });

  it("skips name when it is empty / whitespace-only", () => {
    const out = buildPersonaPreamble({
      name: "   ",
      description: "Just the description please.",
    });
    expect(out).not.toContain("You are");
    expect(out).toContain("Just the description please.");
  });

  it("returns empty string when description is whitespace-only and name is omitted", () => {
    expect(buildPersonaPreamble({ description: "   " })).toBe("");
  });

  it("preserves multi-line descriptions verbatim", () => {
    const description = [
      "Personality: warm, supportive, adaptive.",
      "",
      "Address the user as 'you'. Avoid the word 'unfortunately'.",
    ].join("\n");
    const out = buildPersonaPreamble({ name: "Aria", description });
    expect(out).toContain("Personality: warm, supportive, adaptive.");
    expect(out).toContain("Avoid the word 'unfortunately'.");
  });
});

describe("buildOrchestratorSystemPrompt", () => {
  it("returns the original ORCHESTRATOR_PROMPT verbatim when no persona is set", () => {
    const out = buildOrchestratorSystemPrompt(undefined);
    expect(out.startsWith("You are the Niato orchestrator.")).toBe(true);
  });

  it("prepends the persona preamble above the operational orchestrator prompt", () => {
    const out = buildOrchestratorSystemPrompt({
      name: "Layla",
      description: "Warm, faith-aware. Address the user by name.",
    });
    expect(out.startsWith("You are Layla.")).toBe(true);
    expect(out).toContain("Warm, faith-aware. Address the user by name.");
    // The operational identity stays intact below the persona preamble.
    expect(out).toContain("You are the Niato orchestrator.");
    // Persona block precedes operational block.
    expect(out.indexOf("Layla")).toBeLessThan(
      out.indexOf("Niato orchestrator"),
    );
  });
});

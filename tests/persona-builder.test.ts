import { describe, expect, it } from "vitest";
import { buildPersonaFromCompanion } from "../src/cli/persona-builder.js";
import { type Companion } from "../src/cli/companion-config.js";

const base: Companion = {
  version: 1,
  name: "Layla",
  voice: "warm",
  createdAt: "2026-04-28T00:00:00.000Z",
};

describe("buildPersonaFromCompanion", () => {
  it("emits a persona whose name matches the companion name", () => {
    expect(buildPersonaFromCompanion(base).name).toBe("Layla");
  });

  it("describes the warm voice template by default", () => {
    const persona = buildPersonaFromCompanion(base);
    expect(persona.description).toMatch(/Warm and supportive/);
    expect(persona.description).not.toMatch(/Direct and concise/);
  });

  it("switches voice template based on the companion's voice", () => {
    const direct = buildPersonaFromCompanion({ ...base, voice: "direct" });
    expect(direct.description).toMatch(/Direct and concise/);

    const playful = buildPersonaFromCompanion({ ...base, voice: "playful" });
    expect(playful.description).toMatch(/Light, curious/);
  });

  it("includes the user's name when set, omits when blank", () => {
    const named = buildPersonaFromCompanion({ ...base, userName: "Aman" });
    expect(named.description).toMatch(/Address the user as "Aman"/);

    const blank = buildPersonaFromCompanion({ ...base, userName: "  " });
    expect(blank.description).not.toMatch(/Address the user as/);

    const omitted = buildPersonaFromCompanion(base);
    expect(omitted.description).not.toMatch(/Address the user as/);
  });

  it("appends extraDescription verbatim when present", () => {
    const persona = buildPersonaFromCompanion({
      ...base,
      extraDescription: "Faith-aware, walks alongside not above.",
    });
    expect(persona.description).toMatch(
      /Faith-aware, walks alongside not above\./,
    );
  });

  it("composes voice + name + extra in that order, separated by blank lines", () => {
    const persona = buildPersonaFromCompanion({
      ...base,
      userName: "Aman",
      extraDescription: "Custom note.",
    });
    const idxVoice = persona.description.indexOf("Warm and supportive");
    const idxName = persona.description.indexOf('Address the user as "Aman"');
    const idxExtra = persona.description.indexOf("Custom note.");
    expect(idxVoice).toBeGreaterThan(-1);
    expect(idxName).toBeGreaterThan(idxVoice);
    expect(idxExtra).toBeGreaterThan(idxName);
  });
});

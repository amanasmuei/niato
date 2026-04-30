import { describe, it, expect } from "vitest";
import { resolvePacks } from "../src/cli/tui/resolve-packs.js";
import { genericPack } from "../src/packs/generic/index.js";
import { supportPack } from "../src/packs/support/index.js";
import { devToolsPack } from "../src/packs/dev-tools/index.js";

const all = {
  generic: genericPack,
  support: supportPack,
  dev_tools: devToolsPack,
};

describe("resolvePacks (TUI default-pack policy)", () => {
  it("returns only generic by default (no env, no config)", () => {
    const packs = resolvePacks(all, {});
    expect(packs.map((p) => p.name)).toEqual(["generic"]);
  });

  it("opts in via NAWAITU_PACKS env var", () => {
    const packs = resolvePacks(all, {
      NAWAITU_PACKS: "support,dev_tools",
    });
    expect(packs.map((p) => p.name).sort()).toEqual([
      "dev_tools",
      "generic",
      "support",
    ]);
  });

  it("ignores unknown pack names in NAWAITU_PACKS", () => {
    const packs = resolvePacks(all, {
      NAWAITU_PACKS: "support,bogus,dev_tools",
    });
    expect(packs.map((p) => p.name).sort()).toEqual([
      "dev_tools",
      "generic",
      "support",
    ]);
  });

  it("ignores empty / whitespace-only NAWAITU_PACKS", () => {
    expect(resolvePacks(all, { NAWAITU_PACKS: "" }).map((p) => p.name)).toEqual(
      ["generic"],
    );
    expect(
      resolvePacks(all, { NAWAITU_PACKS: "   ,  ," }).map((p) => p.name),
    ).toEqual(["generic"]);
  });

  it("does not duplicate generic when listed in NAWAITU_PACKS", () => {
    const packs = resolvePacks(all, {
      NAWAITU_PACKS: "generic,support",
    });
    expect(packs.map((p) => p.name).sort()).toEqual(["generic", "support"]);
  });
});

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as flush } from "node:timers/promises";
import { render } from "ink-testing-library";
import { CompanionWizard } from "../../../../src/cli/tui/screens/companion-wizard.js";
import { type Companion } from "../../../../src/cli/companion-config.js";
import { expectDefined } from "../_helpers/expect-defined.js";

const ARROW_DOWN = "\x1B[B";
const ENTER = "\r";
const ESC = "\x1B";

describe("CompanionWizard", () => {
  let tmpDir: string;
  let companionPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "niato-wizard-"));
    companionPath = join(tmpDir, "companion.json");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("step 1 prompts for companion name and rejects empty", async () => {
    const onComplete = vi.fn();
    const { stdin, lastFrame } = render(
      <CompanionWizard
        onComplete={onComplete}
        onCancel={vi.fn()}
        companionPath={companionPath}
      />,
    );
    await flush();
    const frame = lastFrame() ?? "";
    expect(frame).toMatch(/companion name|name your companion|step 1/i);
    stdin.write(ENTER);
    await flush();
    expect(onComplete).not.toHaveBeenCalled();
    expect(lastFrame() ?? "").toMatch(/required|empty/i);
  });

  it("walks all 4 steps with minimum input, saves, and calls onComplete", async () => {
    const onComplete = vi.fn<(companion: Companion) => void>();
    const { stdin } = render(
      <CompanionWizard
        onComplete={onComplete}
        onCancel={vi.fn()}
        companionPath={companionPath}
      />,
    );
    await flush();
    // Step 1: name (required)
    stdin.write("Layla");
    await flush();
    stdin.write(ENTER);
    await flush();
    // Step 2: userName (skip)
    stdin.write(ENTER);
    await flush();
    // Step 3: voice — first menu item is "warm", Enter to pick
    stdin.write(ENTER);
    await flush();
    // Step 4: extraDescription (skip)
    stdin.write(ENTER);
    await flush();

    expect(onComplete).toHaveBeenCalledOnce();
    const arg = expectDefined(onComplete.mock.calls[0]?.[0], "onComplete arg");
    expect(arg).toMatchObject({
      version: 1,
      name: "Layla",
      voice: "warm",
    });
    expect(arg.userName).toBeUndefined();
    expect(arg.extraDescription).toBeUndefined();
    expect(typeof arg.createdAt).toBe("string");

    expect(existsSync(companionPath)).toBe(true);
    // CompanionSchema.parse would throw on bad data; cast is safe here because
    // saveCompanion always writes valid JSON matching the Companion shape.
    const persisted = JSON.parse(readFileSync(companionPath, "utf8")) as Companion;
    expect(persisted.name).toBe("Layla");
    expect(persisted.voice).toBe("warm");
  });

  it("captures optional fields when provided", async () => {
    const onComplete = vi.fn<(companion: Companion) => void>();
    const { stdin } = render(
      <CompanionWizard
        onComplete={onComplete}
        onCancel={vi.fn()}
        companionPath={companionPath}
      />,
    );
    await flush();
    stdin.write("Sage");
    await flush();
    stdin.write(ENTER);
    await flush();
    stdin.write("Aman");
    await flush();
    stdin.write(ENTER);
    await flush();
    // Voice menu: arrow down twice to "playful", Enter
    stdin.write(ARROW_DOWN);
    await flush();
    stdin.write(ARROW_DOWN);
    await flush();
    stdin.write(ENTER);
    await flush();
    stdin.write("Faith-aware, walks alongside not above.");
    await flush();
    stdin.write(ENTER);
    await flush();

    const arg = expectDefined(onComplete.mock.calls[0]?.[0], "onComplete arg");
    expect(arg).toMatchObject({
      version: 1,
      name: "Sage",
      userName: "Aman",
      voice: "playful",
      extraDescription: "Faith-aware, walks alongside not above.",
    });
  });

  it("calls onCancel on Escape from step 1", async () => {
    const onCancel = vi.fn();
    const { stdin } = render(
      <CompanionWizard
        onComplete={vi.fn()}
        onCancel={onCancel}
        companionPath={companionPath}
      />,
    );
    await flush();
    stdin.write(ESC);
    await flush();
    // Esc may need a brief settle (matches the api-key-entry test pattern)
    await new Promise((r) => setTimeout(r, 50));
    expect(onCancel).toHaveBeenCalled();
  });
});

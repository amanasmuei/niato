import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { ApiKeyEntry } from "../../../../src/cli/tui/screens/api-key-entry.js";

const ESC = "\x1B";
const ENTER = "\r";

describe("ApiKeyEntry", () => {
  it("renders header, instruction, and input prompt", () => {
    const { lastFrame } = render(
      <ApiKeyEntry onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("API key");
    expect(frame).toContain("ANTHROPIC_API_KEY");
    expect(frame).toMatch(/›|paste/i);
  });

  it("calls onSubmit with the typed value when Enter is pressed", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <ApiKeyEntry onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    stdin.write("sk-ant-test123");
    await new Promise((r) => setImmediate(r));
    stdin.write(ENTER);
    await new Promise((r) => setImmediate(r));
    expect(onSubmit).toHaveBeenCalledWith("sk-ant-test123");
  });

  it("does not submit empty input", async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(
      <ApiKeyEntry onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    stdin.write(ENTER);
    await new Promise((r) => setImmediate(r));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(lastFrame() ?? "").toMatch(/empty|required|enter a key/i);
  });

  it("warns on suspicious prefix but accepts on second Enter", async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(
      <ApiKeyEntry onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    stdin.write("not-an-anthropic-key");
    await new Promise((r) => setImmediate(r));
    stdin.write(ENTER);
    await new Promise((r) => setImmediate(r));
    expect(lastFrame() ?? "").toMatch(/sk-ant-|expect/i);
    expect(onSubmit).not.toHaveBeenCalled();
    stdin.write(ENTER);
    await new Promise((r) => setImmediate(r));
    expect(onSubmit).toHaveBeenCalledWith("not-an-anthropic-key");
  });

  it("calls onCancel on Escape", async () => {
    const onCancel = vi.fn();
    const { stdin } = render(
      <ApiKeyEntry onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    stdin.write(ESC);
    // Ink debounces a bare ESC by ~20ms to detect chunked escape sequences;
    // wait long enough for the pending-flush timer to fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(onCancel).toHaveBeenCalled();
  });
});

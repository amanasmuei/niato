import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { TextInput } from "../../../../src/cli/tui/components/text-input.js";

const ENTER = "\r";

describe("TextInput", () => {
  it("renders the placeholder when value is empty", () => {
    const { lastFrame } = render(
      <TextInput
        value=""
        placeholder="say something"
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(lastFrame()).toContain("say something");
  });

  it("renders the current value when non-empty", () => {
    const { lastFrame } = render(
      <TextInput
        value="hello"
        placeholder="x"
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(lastFrame()).toContain("hello");
  });

  it("calls onChange when user types", async () => {
    const onChange = vi.fn();
    const { stdin } = render(
      <TextInput
        value=""
        placeholder=""
        onChange={onChange}
        onSubmit={() => undefined}
      />,
    );
    stdin.write("hi");
    await new Promise((r) => setImmediate(r));
    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith("hi");
  });

  it("calls onSubmit on enter", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <TextInput
        value="ready"
        placeholder=""
        onChange={() => undefined}
        onSubmit={onSubmit}
      />,
    );
    stdin.write(ENTER);
    await new Promise((r) => setImmediate(r));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("ready");
  });
});

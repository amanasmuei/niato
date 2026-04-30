import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { ChatScrollback } from "../../../../src/cli/tui/components/chat-scrollback.js";
import { type TurnState } from "../../../../src/cli/tui/hooks/use-niato-session.js";

const turn = (input: string, output?: string): TurnState => ({
  input,
  output,
  classification: undefined,
  trace: undefined,
  errorMessage: undefined,
  phase: output !== undefined ? "done" : "classifying",
});

describe("ChatScrollback", () => {
  it("renders user input + assistant output for each turn", () => {
    const { lastFrame } = render(
      <ChatScrollback
        turns={[turn("hi", "hello"), turn("how are you", "good")]}
        userLabel="you"
        assistantLabel="arienz"
      />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("hi");
    expect(out).toContain("hello");
    expect(out).toContain("how are you");
    expect(out).toContain("good");
    expect(out).toContain("you");
    expect(out).toContain("arienz");
  });

  it("renders the in-flight turn without an output yet", () => {
    const { lastFrame } = render(
      <ChatScrollback
        turns={[turn("loading...")]}
        userLabel="you"
        assistantLabel="arienz"
      />,
    );
    expect(lastFrame()).toContain("loading...");
  });
});

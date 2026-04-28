import { describe, it, expect } from "vitest";
import React from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { useScreenStack } from "../../../../src/cli/tui/hooks/use-screen-stack.js";

function Probe({
  onReady,
}: {
  onReady: (api: ReturnType<typeof useScreenStack>) => void;
}): React.ReactElement {
  const stack = useScreenStack({ name: "a", props: {} });
  React.useEffect(() => {
    onReady(stack);
  }, [stack, onReady]);
  return (
    <Text>
      {stack.current.name}:{String(stack.depth)}
    </Text>
  );
}

describe("useScreenStack", () => {
  it("starts with the initial screen", () => {
    let api: ReturnType<typeof useScreenStack> | undefined;
    const { lastFrame } = render(
      <Probe
        onReady={(a) => {
          api = a;
        }}
      />,
    );
    expect(lastFrame()).toContain("a:1");
    expect(api?.current.name).toBe("a");
  });

  it("push adds, pop removes, replace swaps top", () => {
    let api: ReturnType<typeof useScreenStack> | undefined;
    const { lastFrame, rerender } = render(
      <Probe
        onReady={(a) => {
          api = a;
        }}
      />,
    );

    api?.push("b");
    rerender(
      <Probe
        onReady={(a) => {
          api = a;
        }}
      />,
    );
    expect(lastFrame()).toContain("b:2");

    api?.replace("c");
    rerender(
      <Probe
        onReady={(a) => {
          api = a;
        }}
      />,
    );
    expect(lastFrame()).toContain("c:2");

    api?.pop();
    rerender(
      <Probe
        onReady={(a) => {
          api = a;
        }}
      />,
    );
    expect(lastFrame()).toContain("a:1");
  });

  it("pop is a no-op at depth 1", () => {
    let api: ReturnType<typeof useScreenStack> | undefined;
    const { lastFrame, rerender } = render(
      <Probe
        onReady={(a) => {
          api = a;
        }}
      />,
    );
    api?.pop();
    rerender(
      <Probe
        onReady={(a) => {
          api = a;
        }}
      />,
    );
    expect(lastFrame()).toContain("a:1");
  });
});

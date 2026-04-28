import { describe, it, expect } from "vitest";
import React from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
import {
  useNawaituSession,
  type SessionPhase,
  type UseNawaitu,
} from "../../../../src/cli/tui/hooks/use-nawaitu-session.js";
import { makeStubNawaitu } from "../_helpers/stub-nawaitu.js";
import { expectDefined } from "../_helpers/expect-defined.js";

function Probe({
  capture,
}: {
  capture: (api: UseNawaitu) => void;
}): React.ReactElement {
  const api = useNawaituSession(
    () =>
      makeStubNawaitu([{ output: "hi back" }, { output: "again" }]),
    "sess-1",
  );
  React.useEffect(() => {
    capture(api);
  }, [api, capture]);
  return (
    <Text>
      {api.phase}:{String(api.turns.length)}
    </Text>
  );
}

describe("useNawaituSession", () => {
  it("phase progresses idle → done after run()", async () => {
    let last: UseNawaitu | undefined;
    const { lastFrame, rerender } = render(
      <Probe
        capture={(a): void => {
          last = a;
        }}
      />,
    );
    expect(lastFrame()).toContain("idle:0");

    const api = expectDefined(last, "probe never captured api");
    await api.run("hello");
    rerender(
      <Probe
        capture={(a): void => {
          last = a;
        }}
      />,
    );
    const after = expectDefined(last, "probe never captured api after run");
    const phase: SessionPhase = after.phase;
    expect(phase).toBe("done");
    expect(after.turns).toHaveLength(1);
    const firstTurn = expectDefined(after.turns[0], "expected first turn");
    expect(firstTurn.output).toBe("hi back");
  });

  it("captures error message when nawaitu throws", async () => {
    let last: UseNawaitu | undefined;
    function ErrProbe(): React.ReactElement {
      const api = useNawaituSession(
        () =>
          makeStubNawaitu([
            { output: "", throws: new Error("boom") },
          ]),
        "sess-2",
      );
      React.useEffect(() => {
        last = api;
      }, [api]);
      return <Text>{api.phase}</Text>;
    }
    const { rerender } = render(<ErrProbe />);
    const api = expectDefined(last, "err probe never captured api");
    await api.run("hello");
    rerender(<ErrProbe />);
    const after = expectDefined(last, "err probe never captured api after run");
    expect(after.phase).toBe("error");
    const firstTurn = expectDefined(after.turns[0], "expected first turn");
    expect(firstTurn.errorMessage).toBe("boom");
  });
});

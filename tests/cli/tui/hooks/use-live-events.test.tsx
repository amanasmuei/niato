import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Box, Text } from "ink";
import { useLiveEvents } from "../../../../src/cli/tui/hooks/use-live-events.js";
import { createApprovalChannel } from "../../../../src/guardrails/approval-channel.js";
import { type NiatoEvent } from "../../../../src/observability/events.js";

function Probe({
  events,
}: {
  events: NiatoEvent[];
}): React.ReactElement {
  const channel = createApprovalChannel();
  const live = useLiveEvents(channel);
  // Mount-only: push the canned events once so the Probe asserts the
  // hook accumulates them. Empty deps is intentional here.
  React.useEffect(() => {
    for (const e of events) live.push(e);
  }, []);
  return (
    <Box>
      <Text>{`count=${String(live.events.length)}`}</Text>
    </Box>
  );
}

describe("useLiveEvents", () => {
  it("accumulates pushed events", async () => {
    const { lastFrame } = render(
      <Probe
        events={[
          {
            type: "specialist_dispatched",
            toolUseId: "tu_1",
            specialist: "x.y",
          },
        ]}
      />,
    );
    // Flush mount-effect + state-update queue so the rendered frame
    // reflects the events pushed inside useEffect.
    await new Promise<void>((res) => setImmediate(res));
    expect(lastFrame()).toContain("count=1");
  });
});

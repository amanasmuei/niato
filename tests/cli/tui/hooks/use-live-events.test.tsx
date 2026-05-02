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
  // Stable channel reference across renders — same pattern Task 7 will
  // use in screens/session.tsx. Inline `createApprovalChannel()` would
  // bounce useEffect([channel]) on every render.
  const [channel] = React.useState(() => createApprovalChannel());
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

function ChannelProbe({
  onReady,
}: {
  onReady: (api: {
    channel: ReturnType<typeof createApprovalChannel>;
    live: ReturnType<typeof useLiveEvents>;
  }) => void;
}): React.ReactElement {
  const [channel] = React.useState(() => createApprovalChannel());
  const live = useLiveEvents(channel);
  React.useEffect(() => {
    onReady({ channel, live });
    // Mount-only — `live` and `channel` are intentionally captured at
    // mount time so the test driver can manipulate them between assertions.
  }, []);
  return (
    <Box>
      <Text>{`events=${String(live.events.length)} pending=${live.pendingApproval !== undefined ? live.pendingApproval.approvalId : "none"}`}</Text>
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

  it("auto-pushes approval_requested when channel.request() fires", async () => {
    let api:
      | {
          channel: ReturnType<typeof createApprovalChannel>;
          live: ReturnType<typeof useLiveEvents>;
        }
      | undefined;
    const { lastFrame, rerender } = render(
      <ChannelProbe
        onReady={(x): void => {
          api = x;
        }}
      />,
    );
    await new Promise<void>((res) => setImmediate(res));
    if (api === undefined) throw new Error("ChannelProbe never reported ready");
    // Issue a request — listener should fire, auto-push approval_requested,
    // and set pendingApproval.
    void api.channel.request(
      {
        approvalId: "tu_req_1",
        toolName: "mcp__x__y",
        toolInput: { amount_usd: 600 },
        reason: "over $500",
      },
      new AbortController().signal,
    );
    await new Promise<void>((res) => setImmediate(res));
    rerender(
      <ChannelProbe
        onReady={(x): void => {
          api = x;
        }}
      />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("events=1");
    expect(out).toContain("pending=tu_req_1");
  });

  it("push(approval_resolved) clears pendingApproval", async () => {
    let api:
      | {
          channel: ReturnType<typeof createApprovalChannel>;
          live: ReturnType<typeof useLiveEvents>;
        }
      | undefined;
    const { lastFrame, rerender } = render(
      <ChannelProbe
        onReady={(x): void => {
          api = x;
        }}
      />,
    );
    await new Promise<void>((res) => setImmediate(res));
    if (api === undefined) throw new Error("ChannelProbe never reported ready");
    void api.channel.request(
      {
        approvalId: "tu_req_2",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      new AbortController().signal,
    );
    await new Promise<void>((res) => setImmediate(res));
    api.live.push({
      type: "approval_resolved",
      approvalId: "tu_req_2",
      decision: "allow",
      reason: undefined,
    });
    await new Promise<void>((res) => setImmediate(res));
    rerender(
      <ChannelProbe
        onReady={(x): void => {
          api = x;
        }}
      />,
    );
    expect(lastFrame() ?? "").toContain("pending=none");
  });

  it("reset() clears both events and pendingApproval", async () => {
    let api:
      | {
          channel: ReturnType<typeof createApprovalChannel>;
          live: ReturnType<typeof useLiveEvents>;
        }
      | undefined;
    const { lastFrame, rerender } = render(
      <ChannelProbe
        onReady={(x): void => {
          api = x;
        }}
      />,
    );
    await new Promise<void>((res) => setImmediate(res));
    if (api === undefined) throw new Error("ChannelProbe never reported ready");
    api.live.push({
      type: "specialist_dispatched",
      toolUseId: "tu_a",
      specialist: "x.y",
    });
    void api.channel.request(
      {
        approvalId: "tu_req_3",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      new AbortController().signal,
    );
    await new Promise<void>((res) => setImmediate(res));
    api.live.reset();
    await new Promise<void>((res) => setImmediate(res));
    rerender(
      <ChannelProbe
        onReady={(x): void => {
          api = x;
        }}
      />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("events=0");
    expect(out).toContain("pending=none");
  });

  it("late-mount subscriber sees an already-pending request via channel replay", async () => {
    // Pre-issue a request on a channel BEFORE the hook subscribes.
    // Task 2's ApprovalChannel.subscribe synchronously replays current
    // pending requests to the new listener — verify that replay surfaces
    // through useLiveEvents as both pendingApproval and a synthetic
    // approval_requested event.
    const sharedChannel = createApprovalChannel();
    void sharedChannel.request(
      {
        approvalId: "tu_late",
        toolName: "x",
        toolInput: {},
        reason: "r",
      },
      new AbortController().signal,
    );

    function LateMountProbe(): React.ReactElement {
      const live = useLiveEvents(sharedChannel);
      return (
        <Box>
          <Text>{`events=${String(live.events.length)} pending=${live.pendingApproval !== undefined ? live.pendingApproval.approvalId : "none"}`}</Text>
        </Box>
      );
    }

    const { lastFrame } = render(<LateMountProbe />);
    await new Promise<void>((res) => setImmediate(res));
    const out = lastFrame() ?? "";
    expect(out).toContain("events=1");
    expect(out).toContain("pending=tu_late");
  });
});

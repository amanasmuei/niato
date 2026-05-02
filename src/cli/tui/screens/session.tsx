import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { ChatScrollback } from "../components/chat-scrollback.js";
import { Footer } from "../components/footer.js";
import { TextInput } from "../components/text-input.js";
import { LivePanel } from "../components/live-panel.js";
import {
  useNiatoSession,
  type TurnState,
} from "../hooks/use-niato-session.js";
import { useLiveEvents } from "../hooks/use-live-events.js";
import {
  appendSessionStart,
  appendTurn,
  appendError,
  type SessionMode,
} from "../store/sessions.js";
import { type Companion } from "../../companion-config.js";
import { type Niato } from "../../../core/compose.js";
import { type Logger } from "../../../observability/log.js";
import {
  createApprovalChannel,
  type ApprovalChannel,
} from "../../../guardrails/approval-channel.js";

// `sessionsDir?: string | undefined` (vs bare `?:`) so callers operating
// under `exactOptionalPropertyTypes: true` can pass either omit-the-key
// or pass `undefined` explicitly without a conditional spread.
//
// `niatoFactory` takes an optional ApprovalChannel so this screen can
// inject its own per-mount channel into the constructed Niato. The
// existing `() => makeStubNiato([])` test fixtures stay assignable
// thanks to TS function-param contravariance — they simply ignore the
// extra args.
export interface SessionProps {
  companion: Companion;
  mode: SessionMode;
  sessionId: string;
  sessionsDir?: string | undefined;
  niatoFactory: (
    logger: Logger,
    approval: ApprovalChannel | undefined,
  ) => Niato;
  replayedTurns: TurnState[];
  onExit: () => void;
}

// Top-level chat screen — composes ChatScrollback + TextInput + Footer
// and threads `useNiatoSession` with on-turn JSONL persistence.
//
// JSONL persistence rules:
//   • A fresh session (`replayedTurns.length === 0`) writes a
//     `session-start` line on first mount.
//   • A resumed session skips the start line — it already exists in
//     the source JSONL, replayed in via `replayedTurns`.
//   • Each completed turn (output + trace defined) appends a `turn` line.
export function Session({
  companion,
  mode,
  sessionId,
  sessionsDir,
  niatoFactory,
  replayedTurns,
  onExit,
}: SessionProps): React.ReactElement {
  const [draft, setDraft] = useState<string>("");
  const startedRef = useRef<boolean>(false);

  // One ApprovalChannel per Session mount. Lazy useState initializer keeps
  // the reference stable across renders (re-creating it would re-fire
  // useLiveEvents' useEffect and unsub the prior listener every render).
  const [channel] = useState<ApprovalChannel>(() => createApprovalChannel());
  const live = useLiveEvents(channel);

  // Wrap the incoming factory to inject our owned channel without
  // changing useNiatoSession's signature. useCallback so `niato`
  // construction inside useNiatoSession (which uses useState's lazy
  // init) sees a stable reference.
  const factoryForHook = useCallback(
    (logger: Logger): Niato => niatoFactory(logger, channel),
    [niatoFactory, channel],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (replayedTurns.length === 0) {
      appendSessionStart(sessionId, mode, companion.version, sessionsDir);
    }
  }, [sessionId, mode, companion.version, sessionsDir, replayedTurns.length]);

  const session = useNiatoSession(
    factoryForHook,
    sessionId,
    (turn: TurnState): void => {
      if (turn.errorMessage !== undefined) {
        appendError(sessionId, turn.input, turn.errorMessage, sessionsDir);
      } else if (turn.output !== undefined && turn.trace !== undefined) {
        appendTurn(
          sessionId,
          turn.input,
          turn.output,
          turn.trace,
          turn.classification,
          sessionsDir,
        );
      }
    },
    // Arrow wrap rather than passing `live.push` directly — eslint's
    // @typescript-eslint/unbound-method flags any `.method` reference
    // that isn't typed `this: void`. The callback is stable across
    // renders inside useLiveEvents (useCallback), so this wrapper does
    // not change useNiatoSession's effect identity.
    (event) => {
      live.push(event);
    },
  );

  // Approve / deny helpers. Per ApprovalChannel contract (see Task 6 review),
  // channel.resolve does NOT auto-fire the listener for the resolved request,
  // so we explicitly push the synthetic `approval_resolved` event into
  // useLiveEvents — that's what clears `pendingApproval` in the hook.
  const handleApprove = (approvalId: string): void => {
    channel.resolve(approvalId, { decision: "allow", reason: undefined });
    live.push({
      type: "approval_resolved",
      approvalId,
      decision: "allow",
      reason: undefined,
    });
  };
  const handleDeny = (approvalId: string): void => {
    const reason = "denied via TUI";
    channel.resolve(approvalId, { decision: "deny", reason });
    live.push({
      type: "approval_resolved",
      approvalId,
      decision: "deny",
      reason,
    });
  };

  useInput((_input, key) => {
    if (key.escape) onExit();
  });

  const allTurns: TurnState[] = [...replayedTurns, ...session.turns];

  // In-flight or post-completion: panel stays mounted as long as the
  // turn is running or has produced visible state. Including "classifying"
  // closes the flicker gap between submit and the first turn_start event
  // landing in live.events — useNiatoSession.run() flips phase to
  // "classifying" synchronously before awaiting runStream, so without this
  // the panel disappears for one render on cold-start classification.
  const showLivePanel =
    session.phase === "classifying" ||
    session.phase === "dispatching" ||
    live.events.length > 0;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {companion.name}
        </Text>
        <Text color="gray">
          {`  · ${mode} · session ${sessionId.slice(0, 8)} · esc to exit`}
        </Text>
      </Box>

      <ChatScrollback
        turns={allTurns}
        userLabel={companion.userName ?? "you"}
        assistantLabel={companion.name.toLowerCase()}
      />

      {showLivePanel && (
        <Box marginTop={1}>
          <LivePanel
            events={live.events}
            pendingApproval={live.pendingApproval}
            onApprove={handleApprove}
            onDeny={handleDeny}
          />
        </Box>
      )}

      <Box marginTop={1}>
        <TextInput
          value={draft}
          placeholder="type your message..."
          onChange={setDraft}
          // Modally suspend text capture while an approval is pending so
          // the user's 'a'/'d' keystrokes only resolve the prompt and
          // don't also land in the draft buffer. Paired with LivePanel's
          // `isActive: pendingApproval !== undefined` for symmetric
          // framework-level gating.
          isActive={live.pendingApproval === undefined}
          onSubmit={(v) => {
            if (v.trim().length === 0) return;
            setDraft("");
            // Reset live event accumulator so the new turn starts with a
            // clean panel rather than appending to the prior turn's tree.
            live.reset();
            void session.run(v);
          }}
        />
      </Box>

      <Box marginTop={1}>
        <Footer
          mode={mode}
          phase={session.phase}
          {...(session.classification !== undefined
            ? { classification: session.classification }
            : {})}
          {...(session.trace !== undefined ? { trace: session.trace } : {})}
        />
      </Box>
    </Box>
  );
}

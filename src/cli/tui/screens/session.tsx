import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { ChatScrollback } from "../components/chat-scrollback.js";
import { Footer } from "../components/footer.js";
import { TextInput } from "../components/text-input.js";
import {
  useNawaituSession,
  type TurnState,
} from "../hooks/use-nawaitu-session.js";
import {
  appendSessionStart,
  appendTurn,
  type SessionMode,
} from "../store/sessions.js";
import { type Companion } from "../../companion-config.js";
import { type Nawaitu } from "../../../core/compose.js";
import { type Logger } from "../../../observability/log.js";

// `sessionsDir?: string | undefined` (vs bare `?:`) so callers operating
// under `exactOptionalPropertyTypes: true` can pass either omit-the-key
// or pass `undefined` explicitly without a conditional spread.
export interface SessionProps {
  companion: Companion;
  mode: SessionMode;
  sessionId: string;
  sessionsDir?: string | undefined;
  nawaituFactory: (logger: Logger) => Nawaitu;
  replayedTurns: TurnState[];
  onExit: () => void;
}

// Top-level chat screen — composes ChatScrollback + TextInput + Footer
// and threads `useNawaituSession` with on-turn JSONL persistence.
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
  nawaituFactory,
  replayedTurns,
  onExit,
}: SessionProps): React.ReactElement {
  const [draft, setDraft] = useState<string>("");
  const startedRef = useRef<boolean>(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (replayedTurns.length === 0) {
      appendSessionStart(sessionId, mode, companion.version, sessionsDir);
    }
  }, [sessionId, mode, companion.version, sessionsDir, replayedTurns.length]);

  const session = useNawaituSession(
    nawaituFactory,
    sessionId,
    (turn: TurnState): void => {
      if (turn.output !== undefined && turn.trace !== undefined) {
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
  );

  useInput((_input, key) => {
    if (key.escape) onExit();
  });

  const allTurns: TurnState[] = [...replayedTurns, ...session.turns];

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

      <Box marginTop={1}>
        <TextInput
          value={draft}
          placeholder="type your message..."
          onChange={setDraft}
          onSubmit={(v) => {
            if (v.trim().length === 0) return;
            setDraft("");
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

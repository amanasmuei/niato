import React from "react";
import { Box, Text } from "ink";
import { type TurnState } from "../hooks/use-niato-session.js";

export interface ChatScrollbackProps {
  turns: TurnState[];
  userLabel: string;
  assistantLabel: string;
}

// Visual log of turn exchanges in a session: each turn renders
// the user's input followed by the assistant's output (when present)
// and any error. Ink renders content sequentially as a stream, so
// newer turns naturally appear below older ones — explicit virtualization
// or scrolling is deferred to a later phase.
export function ChatScrollback({
  turns,
  userLabel,
  assistantLabel,
}: ChatScrollbackProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {turns.map((t, idx) => (
        <Box key={String(idx)} flexDirection="column" marginBottom={1}>
          <Box>
            <Box marginRight={1}>
              <Text color="cyan" bold>
                {userLabel}
              </Text>
            </Box>
            <Text>{t.input}</Text>
          </Box>
          {t.output !== undefined && (
            <Box>
              <Box marginRight={1}>
                <Text color="yellow" bold>
                  {assistantLabel}
                </Text>
              </Box>
              <Text>{t.output}</Text>
            </Box>
          )}
          {t.errorMessage !== undefined && (
            <Box>
              <Text color="red">{`error: ${t.errorMessage}`}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

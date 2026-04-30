import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { TextInput } from "../components/text-input.js";

export interface ApiKeyEntryProps {
  onSubmit: (apiKey: string) => void;
  onCancel: () => void;
}

const ANTHROPIC_PREFIX = "sk-ant-";

export function ApiKeyEntry({
  onSubmit,
  onCancel,
}: ApiKeyEntryProps): React.ReactElement {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  const handleSubmit = (v: string): void => {
    if (v.length === 0) {
      setError("API key is required. Enter a value or press Esc to go back.");
      setPendingConfirm(false);
      return;
    }
    if (!v.startsWith(ANTHROPIC_PREFIX) && !pendingConfirm) {
      setError(
        `Anthropic keys usually start with '${ANTHROPIC_PREFIX}'. ` +
          "Press Enter again to use this value anyway, or type a different key.",
      );
      setPendingConfirm(true);
      return;
    }
    onSubmit(v);
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        API key
      </Text>
      <Text color="gray">
        Paste your ANTHROPIC_API_KEY (saved to ~/.niato/auth.json,
        chmod 600).
      </Text>
      <Box marginTop={1}>
        <TextInput
          value={value}
          placeholder="sk-ant-..."
          onChange={(v) => {
            setValue(v);
            if (error !== null) setError(null);
            if (pendingConfirm) setPendingConfirm(false);
          }}
          onSubmit={handleSubmit}
        />
      </Box>
      {error !== null ? (
        <Box marginTop={1}>
          <Text color="yellow">{error}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Enter to save · Esc to go back
        </Text>
      </Box>
    </Box>
  );
}

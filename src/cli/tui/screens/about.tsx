import React from "react";
import { Box, Text, useInput } from "ink";

export interface AboutProps {
  version: string;
  onBack: () => void;
}

export function About({ version, onBack }: AboutProps): React.ReactElement {
  useInput((input, key) => {
    if (key.escape || input === "q" || key.return) onBack();
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        Niato
      </Text>
      <Text color="gray">{`version ${version}`}</Text>
      <Box marginTop={1}>
        <Text>Intent-routing agent on the Claude Agent SDK.</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color="gray">License: see package.json</Text>
        <Text color="gray">Docs: README.md · ARCHITECTURE.md</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">esc / q / enter — back</Text>
      </Box>
    </Box>
  );
}

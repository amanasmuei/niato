import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export interface PhaseLineProps {
  label: string;
  active: boolean;
  done: boolean;
  failed: boolean;
  detail?: string | undefined;
}

export function PhaseLine({
  label,
  active,
  done,
  failed,
  detail,
}: PhaseLineProps): React.ReactElement {
  let icon: React.ReactElement;
  if (failed) {
    icon = <Text color="red">✗</Text>;
  } else if (done) {
    icon = <Text color="green">✓</Text>;
  } else if (active) {
    icon = (
      <Text color="yellow">
        <Spinner type="dots" />
      </Text>
    );
  } else {
    icon = <Text color="gray">·</Text>;
  }
  return (
    <Box>
      <Box marginRight={1}>{icon}</Box>
      <Text {...(done ? {} : { color: "gray" })}>{label}</Text>
      {detail !== undefined && (
        <Text color="cyan">{`  ${detail}`}</Text>
      )}
    </Box>
  );
}

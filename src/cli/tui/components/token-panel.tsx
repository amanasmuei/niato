import React from "react";
import { Box, Text } from "ink";
import { type TurnRecord } from "../../../observability/trace.js";

export interface TokenPanelProps {
  trace: TurnRecord;
}

function shortenModel(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

export function TokenPanel({ trace }: TokenPanelProps): React.ReactElement {
  const rows = Object.entries(trace.tokensByModel);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">Tokens</Text>
      {rows.map(([model, usage]) => (
        <Box key={model}>
          <Box width={32}>
            <Text>{shortenModel(model)}</Text>
          </Box>
          <Text color="gray">
            {`${String(usage.inputTokens)} in · ${String(usage.outputTokens)} out · ${String(usage.cacheReadInputTokens)} cache-read · ${String(usage.cacheCreationInputTokens)} cache-create`}
          </Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color="gray">{`Cost $${trace.costUsd.toFixed(4)} · Latency ${(trace.latencyMs / 1000).toFixed(1)}s · Outcome ${trace.outcome}`}</Text>
      </Box>
    </Box>
  );
}

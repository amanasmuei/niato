import React from "react";
import { Box, Text } from "ink";
import { Menu, type MenuItem } from "../components/menu.js";
import { type AuthMode } from "../store/auth.js";

export interface FirstRunProps {
  onAuthPicked: (mode: AuthMode) => void;
}

// Narrow the menu's emitted string id back into the AuthMode union without a
// blind `as` cast. The two ids below match the AuthMode union exactly; any
// unexpected id falls back to "subscription" (the recommended default).
function toAuthMode(id: string): AuthMode {
  if (id === "subscription" || id === "api-key") return id;
  return "subscription";
}

export function FirstRun({
  onAuthPicked,
}: FirstRunProps): React.ReactElement {
  const items: MenuItem[] = [
    {
      id: "subscription",
      label: "Claude subscription (recommended)",
      detail: "wraps `claude /login`",
    },
    {
      id: "api-key",
      label: "API key",
      detail: "paste in next step (or set ANTHROPIC_API_KEY in shell)",
    },
  ];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        Welcome to Nawaitu
      </Text>
      <Text color="gray">First run — let&apos;s pick your auth path.</Text>
      <Box marginTop={1}>
        <Menu
          items={items}
          onSelect={(id) => {
            onAuthPicked(toAuthMode(id));
          }}
        />
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Note: subscription auth wraps your existing Claude Code login. ToS
          considerations apply — see README &quot;Note on subscription auth&quot;.
        </Text>
      </Box>
    </Box>
  );
}

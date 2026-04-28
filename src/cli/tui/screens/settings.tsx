import React from "react";
import { Box, Text } from "ink";
import { Menu, type MenuItem } from "../components/menu.js";
import { type Companion } from "../../companion-config.js";
import { type AuthState } from "../store/auth.js";

export interface SettingsProps {
  companion: Companion;
  auth: AuthState | null;
  onBack: () => void;
  onResetCompanion: () => void;
  onResetAuth: () => void;
}

export function Settings({
  companion,
  auth,
  onBack,
  onResetCompanion,
  onResetAuth,
}: SettingsProps): React.ReactElement {
  const items: MenuItem[] = [
    {
      id: "companion",
      label: "Re-run companion wizard",
      detail: `${companion.name} · ${companion.voice}`,
    },
    {
      id: "auth",
      label: "Re-run auth setup",
      detail: auth?.mode ?? "(none)",
    },
    { id: "back", label: "Back" },
  ];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        Settings
      </Text>
      <Box marginTop={1}>
        <Menu
          items={items}
          onSelect={(id) => {
            if (id === "companion") onResetCompanion();
            else if (id === "auth") onResetAuth();
            else onBack();
          }}
          onCancel={onBack}
        />
      </Box>
    </Box>
  );
}

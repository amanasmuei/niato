import React from "react";
import { Box, Text } from "ink";
import { Menu, type MenuItem } from "../components/menu.js";
import { type Companion } from "../../companion-config.js";

export type LauncherChoice =
  | "new"
  | "resume"
  | "history"
  | "settings"
  | "about"
  | "quit";

export interface LauncherProps {
  companion: Companion;
  hasResumable: boolean;
  onSelect: (choice: LauncherChoice) => void;
}

function timeOfDay(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "late night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "late evening";
}

// Narrow the menu's emitted string id back into the LauncherChoice union
// without a blind `as` cast. Anything outside the five menu ids falls
// back to "quit" (which is what cancelling/escape does anyway).
function toChoice(id: string): LauncherChoice {
  if (
    id === "new" ||
    id === "resume" ||
    id === "history" ||
    id === "settings" ||
    id === "about"
  ) {
    return id;
  }
  return "quit";
}

export function Launcher({
  companion,
  hasResumable,
  onSelect,
}: LauncherProps): React.ReactElement {
  // Build items with conditional `detail` to satisfy exactOptionalPropertyTypes
  // (MenuItem.detail is `detail?: string`, so the key must be omitted when
  // there is no detail rather than passed as `undefined`).
  const resumeItem: MenuItem = hasResumable
    ? { id: "resume", label: "Resume last" }
    : {
        id: "resume",
        label: "Resume last",
        disabled: true,
        detail: "(no sessions yet)",
      };

  const items: MenuItem[] = [
    { id: "new", label: "New session" },
    resumeItem,
    { id: "history", label: "History" },
    { id: "settings", label: "Settings" },
    { id: "about", label: "About" },
  ];

  const greetingTo = companion.userName ?? "you";

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        {companion.name}
      </Text>
      <Text color="gray">{`${timeOfDay()}, ${greetingTo}.`}</Text>
      <Box marginTop={1}>
        <Menu
          items={items}
          onSelect={(id) => {
            onSelect(toChoice(id));
          }}
          onCancel={() => {
            onSelect("quit");
          }}
        />
      </Box>
    </Box>
  );
}

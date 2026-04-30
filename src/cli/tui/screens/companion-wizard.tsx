import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { TextInput } from "../components/text-input.js";
import { Menu, type MenuItem } from "../components/menu.js";
import {
  saveCompanion,
  VOICE_ARCHETYPES,
  type Companion,
  type VoiceArchetype,
} from "../../companion-config.js";

export interface CompanionWizardProps {
  onComplete: (companion: Companion) => void;
  onCancel: () => void;
  companionPath?: string;
}

type Step = "name" | "userName" | "voice" | "description";

// Narrow the menu's emitted string id back into the VoiceArchetype union
// without a blind `as` cast. The ids match VOICE_ARCHETYPES exactly; any
// unexpected id falls back to "warm" (the first / default archetype).
function toVoice(id: string): VoiceArchetype {
  if (id === "warm" || id === "direct" || id === "playful") return id;
  return "warm";
}

export function CompanionWizard({
  onComplete,
  onCancel,
  companionPath,
}: CompanionWizardProps): React.ReactElement {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [userName, setUserName] = useState("");
  const [voice, setVoice] = useState<VoiceArchetype>("warm");
  const [extraDescription, setExtraDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Esc at step 1 cancels; later steps go back one step.
  useInput((_input, key) => {
    if (!key.escape) return;
    if (step === "name") onCancel();
    else if (step === "userName") setStep("name");
    else if (step === "voice") setStep("userName");
    else setStep("voice");
  });

  if (step === "name") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="cyan">
          Set up your companion
        </Text>
        <Text color="gray">Step 1 of 4 — companion name (required)</Text>
        <Box marginTop={1}>
          <TextInput
            value={name}
            placeholder="e.g. Layla, Sage, Arienz..."
            onChange={(v) => {
              setName(v);
              if (error !== null) setError(null);
            }}
            onSubmit={(v) => {
              if (v.length === 0) {
                setError("Companion name is required.");
                return;
              }
              setError(null);
              setStep("userName");
            }}
          />
        </Box>
        {error !== null ? (
          <Box marginTop={1}>
            <Text color="yellow">{error}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Enter to continue · Esc to cancel
          </Text>
        </Box>
      </Box>
    );
  }

  if (step === "userName") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="cyan">
          Set up your companion
        </Text>
        <Text color="gray">Step 2 of 4 — your name (optional)</Text>
        <Box marginTop={1}>
          <TextInput
            value={userName}
            placeholder="leave empty to skip"
            onChange={setUserName}
            onSubmit={() => {
              setStep("voice");
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Enter to continue · Esc to go back
          </Text>
        </Box>
      </Box>
    );
  }

  if (step === "voice") {
    const items: MenuItem[] = VOICE_ARCHETYPES.map((v) => ({
      id: v,
      label: v,
      detail:
        v === "warm"
          ? "warm + supportive"
          : v === "direct"
            ? "concise + pragmatic"
            : "playful + curious",
    }));
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="cyan">
          Set up your companion
        </Text>
        <Text color="gray">Step 3 of 4 — voice archetype</Text>
        <Box marginTop={1}>
          <Menu
            items={items}
            onSelect={(id) => {
              setVoice(toVoice(id));
              setStep("description");
            }}
            onCancel={() => {
              setStep("userName");
            }}
          />
        </Box>
      </Box>
    );
  }

  // step === "description" — final step, persists and completes.
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        Set up your companion
      </Text>
      <Text color="gray">Step 4 of 4 — extra description (optional)</Text>
      <Box marginTop={1}>
        <TextInput
          value={extraDescription}
          placeholder="leave empty to skip"
          onChange={setExtraDescription}
          onSubmit={(description) => {
            const companion: Companion = {
              version: 1,
              name,
              voice,
              createdAt: new Date().toISOString(),
              ...(userName.length > 0 ? { userName } : {}),
              ...(description.length > 0
                ? { extraDescription: description }
                : {}),
            };
            saveCompanion(companion, companionPath);
            onComplete(companion);
          }}
        />
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Enter to finish · Esc to go back
        </Text>
      </Box>
    </Box>
  );
}

import * as readline from "node:readline";
import {
  VOICE_ARCHETYPES,
  type Companion,
  type VoiceArchetype,
} from "./companion-config.js";

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

function isVoiceArchetype(value: string): value is VoiceArchetype {
  return (VOICE_ARCHETYPES as readonly string[]).includes(value);
}

// Guided first-run wizard. Four prompts, no surprises:
//   1. Companion name (required)
//   2. Address you as / your name (optional)
//   3. Voice [warm|direct|playful] (default: warm)
//   4. Anything else (optional, free text)
//
// Output is persisted as Companion JSON; persona-builder.ts later
// composes that into the freeform Persona the orchestrator uses.
export async function runSetupWizard(): Promise<Companion> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  console.log("Welcome. Let's set up your companion.\n");

  let name = "";
  while (name.length === 0) {
    name = (await prompt(rl, "Companion name: ")).trim();
    if (name.length === 0) console.log("(name is required)\n");
  }

  const userName = (
    await prompt(rl, "Address you as (your name, optional): ")
  ).trim();

  let voice: VoiceArchetype | undefined;
  while (voice === undefined) {
    const raw = (
      await prompt(rl, "Voice [warm/direct/playful] (default: warm): ")
    ).trim();
    if (raw.length === 0) {
      voice = "warm";
    } else if (isVoiceArchetype(raw)) {
      voice = raw;
    } else {
      console.log(`(must be one of ${VOICE_ARCHETYPES.join(", ")})\n`);
    }
  }

  const extra = (await prompt(rl, "Anything else (optional): ")).trim();

  rl.close();
  console.log();

  return {
    version: 1,
    name,
    ...(userName.length > 0 ? { userName } : {}),
    voice,
    ...(extra.length > 0 ? { extraDescription: extra } : {}),
    createdAt: new Date().toISOString(),
  };
}

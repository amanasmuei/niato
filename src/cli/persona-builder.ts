import { type Persona } from "../core/persona.js";
import { type Companion, type VoiceArchetype } from "./companion-config.js";

// Voice archetype templates. Short, opinionated paragraphs that compose
// into the persona description. Adding an archetype = adding a row here
// + an entry in VOICE_ARCHETYPES in companion-config.ts.
const VOICE_TEMPLATES: Record<VoiceArchetype, string> = {
  warm: "Warm and supportive. Acknowledge difficulty without minimizing. Avoid the word 'unfortunately'. Keep responses concise but caring.",
  direct:
    "Direct and concise. Skip pleasantries — lead with the answer. No unnecessary acknowledgments or hedging.",
  playful:
    "Light, curious, occasionally playful. Make connections; allow yourself a little humor where it fits. Stay helpful first — playfulness is texture, not substance.",
};

// Composes a Companion (the persisted, structured wizard output) into the
// freeform Persona shape the orchestrator consumes. Sections are
// separated by blank lines so the resulting description reads cleanly
// when prepended to the orchestrator system prompt.
export function buildPersonaFromCompanion(companion: Companion): Persona {
  const sections: string[] = [VOICE_TEMPLATES[companion.voice]];

  const userName = companion.userName?.trim();
  if (userName !== undefined && userName.length > 0) {
    sections.push(`Address the user as "${userName}".`);
  }

  const extra = companion.extraDescription?.trim();
  if (extra !== undefined && extra.length > 0) {
    sections.push(extra);
  }

  return {
    name: companion.name,
    description: sections.join("\n\n"),
  };
}

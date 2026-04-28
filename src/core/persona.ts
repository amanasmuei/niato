// Level 1 persona: a freeform user-facing identity layer prepended to the
// orchestrator's system prompt. Persona is the *who* (warm, faith-aware,
// addresses the user by name); the existing orchestrator prompt is the
// *what* (dispatch via Agent only, confidence policy, plan-before-act).
//
// Pack brand voice continues to live in each specialist's prompt.md.
// Persona doesn't reach specialists — they stay role-focused tools the
// orchestrator uses. ARCHITECTURE.md invariant #4 (subagents don't
// inherit parent context) keeps that boundary clean.
//
// Per-user / multi-tenant persona, persistent companion memory, and
// time-of-day modulation are out of scope here — see README "Up next" for
// the Level 2 / Level 3 design notes.

export interface Persona {
  // Optional display name. When set, the orchestrator opens with
  // "You are {name}." Otherwise it opens straight into the description.
  name?: string;
  // Freeform description: voice, values, address style, anything you'd
  // put in a system-prompt prefix. Multi-line strings are fine; the text
  // is injected verbatim above the operational dispatch instructions.
  description: string;
}

export function buildPersonaPreamble(persona: Persona | undefined): string {
  if (persona === undefined) return "";
  const trimmed = persona.description.trim();
  const lines: string[] = [];
  if (persona.name !== undefined && persona.name.trim().length > 0) {
    lines.push(`You are ${persona.name.trim()}.`);
  }
  if (trimmed.length > 0) {
    lines.push(trimmed);
  }
  if (lines.length === 0) return "";
  // Trailing blank line + horizontal rule separates persona identity from
  // the operational orchestrator prompt that follows. Same Markdown rule
  // pattern the existing prompt uses for section breaks.
  return `${lines.join("\n\n")}\n\n---\n\n`;
}

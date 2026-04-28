import {
  type HookEvent,
  type HookCallbackMatcher,
} from "@anthropic-ai/claude-agent-sdk";

export type Hooks = Partial<Record<HookEvent, HookCallbackMatcher[]>>;

// Concatenate per-event hook arrays in the order the layers were passed.
// Earlier layers run first; the SDK short-circuits on the first deny, so
// order encodes precedence — built-in invariants → globalHooks → pack
// hooks (per Phase 3 plan §3).
export function mergeHooks(...layers: Hooks[]): Hooks {
  const merged: Hooks = {};
  for (const layer of layers) {
    for (const [event, matchers] of Object.entries(layer)) {
      if (matchers.length === 0) continue;
      const key = event as HookEvent;
      const existing = merged[key];
      if (existing === undefined) {
        merged[key] = [...matchers];
      } else {
        existing.push(...matchers);
      }
    }
  }
  return merged;
}

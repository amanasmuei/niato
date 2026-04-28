import {
  type HookEvent,
  type HookCallbackMatcher,
} from "@anthropic-ai/claude-agent-sdk";

// Placeholder for Phase 3. Mirrors the SDK's `Options.hooks` shape so a
// caller can pass hooks through createNawaitu now even though Phase 1 does
// not wire them into the orchestrator yet.
export type Hooks = Partial<Record<HookEvent, HookCallbackMatcher[]>>;

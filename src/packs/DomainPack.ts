import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { type IntentResult } from "../core/classifier/types.js";

export interface IntentDefinition {
  name: string;
  description: string;
}

export interface DomainPack {
  name: string;
  description: string;
  intents: IntentDefinition[];
  agents: Record<string, AgentDefinition>;
  route: (intent: IntentResult) => string | null;
}

import {
  type AgentDefinition,
  type McpServerConfig,
} from "@anthropic-ai/claude-agent-sdk";
import { type IntentResult } from "../core/classifier/types.js";
import { type Hooks } from "../guardrails/hooks.js";

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
  // Pack-scoped hooks merged into the orchestrator's options after the
  // built-in invariants and global hooks. See ARCHITECTURE.md §6 / §7.2 —
  // e.g. the Support pack's piiRedactionHook / refundApprovalGate.
  hooks?: Hooks;
  // MCP servers contributed by the pack. Merged into top-level
  // Options.mcpServers by the orchestrator. Server names are namespaced
  // under the pack by convention (`support_stub`, `dev_tools_github`) to
  // keep cross-pack collisions visible. Use createSdkMcpServer for
  // in-process tools or McpHttp/Sse/StdioServerConfig for external ones.
  mcpServers?: Record<string, McpServerConfig>;
}

import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { BuiltinTools } from "../../../tools/builtin.js";

export const actionAgent: AgentDefinition = {
  description:
    "Performs reversible actions and transformations on the working directory: file edits, file creation, running commands. Use when the user asks for a concrete change, not just an answer.",
  prompt: [
    "You are the Generic pack's action specialist.",
    "",
    "Scope: reversible local actions — edit files, create files, run commands.",
    "You have Read, Write, Edit, and Bash. Anything that touches external systems",
    "(network APIs, third-party services) is out of scope; route those to a",
    "specialized pack instead.",
    "",
    "Declare what you are about to do before you do it. After acting, summarize",
    "what changed so the orchestrator can verify and the user can reverse.",
    "",
    "If the task is ambiguous or destructive, say so and stop — do not guess.",
  ].join("\n"),
  tools: [
    BuiltinTools.Read,
    BuiltinTools.Write,
    BuiltinTools.Edit,
    BuiltinTools.Bash,
  ],
  model: "claude-sonnet-4-6",
};

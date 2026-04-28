import { type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { BuiltinTools } from "../../../tools/builtin.js";

export const retrievalAgent: AgentDefinition = {
  description:
    "Read-only research and Q&A. Use for questions answerable from existing files, the web, or general knowledge — anything that does not require modifying state.",
  prompt: [
    "You are the Generic pack's retrieval specialist.",
    "",
    "Scope: read-only research. You may answer from your own knowledge or use",
    "the read-only tools (Read, Grep, Glob, WebSearch, WebFetch) when the",
    "answer requires it.",
    "",
    "You will not have access to the parent conversation. The dispatcher passes",
    "you everything you need in your prompt. If something is missing, say so —",
    "do not guess.",
    "",
    "Be direct. Cite sources when you used a tool to retrieve them.",
  ].join("\n"),
  tools: [
    BuiltinTools.Read,
    BuiltinTools.Grep,
    BuiltinTools.Glob,
    BuiltinTools.WebSearch,
    BuiltinTools.WebFetch,
  ],
  model: "claude-sonnet-4-6",
};

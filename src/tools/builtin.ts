export const BuiltinTools = {
  Agent: "Agent",
  Read: "Read",
  Write: "Write",
  Edit: "Edit",
  Bash: "Bash",
  Grep: "Grep",
  Glob: "Glob",
  WebSearch: "WebSearch",
  WebFetch: "WebFetch",
} as const;

export type BuiltinTool = (typeof BuiltinTools)[keyof typeof BuiltinTools];

import { type DomainPack, type IntentDefinition } from "../DomainPack.js";
import { retrievalAgent } from "./agents/retrieval.js";
import { actionAgent } from "./agents/action.js";
import { escalateAgent } from "./agents/escalate.js";

const intents: IntentDefinition[] = [
  { name: "question", description: "User asks for information or explanation" },
  { name: "task", description: "User asks for a concrete action or transformation" },
  { name: "escalate", description: "User asks for a human" },
];

const intentToSpecialist: Record<string, string> = {
  question: "retrieval",
  task: "action",
  escalate: "escalate",
};

export const genericPack: DomainPack = {
  name: "generic",
  description:
    "General-purpose questions and tasks not covered by a specialized pack.",
  intents,
  agents: {
    retrieval: retrievalAgent,
    action: actionAgent,
    escalate: escalateAgent,
  },
  route: (intent) => intentToSpecialist[intent.intent] ?? null,
};

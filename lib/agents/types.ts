import type { Persona } from "./personas-data";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentName = "entry" | "pm" | "persona" | "summary";

export type QAEntry = {
  persona: Persona;
  answers: string[];
};

export type StreamEvent =
  | { type: "agent_start"; agent: AgentName; label?: string }
  | { type: "agent_text"; agent: AgentName; label?: string; text: string }
  | { type: "agent_done"; agent: AgentName; label?: string }
  | { type: "personas_intro"; personas: Persona[]; productContext?: string }
  | { type: "personas_qa"; questions: string[]; entries: QAEntry[] }
  | { type: "error"; message: string }
  | { type: "complete" };

export type ResearchBrief = {
  productConcept: string;
  keyQuestions: string[];
  targetSegment: string;
};

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
  /**
   * 訪談中：每位受訪者完成所有題目時即時 yield 一筆，給前端漸進式呈現用。
   * `completed / total` 讓前端可顯示「X / N 位已回答」進度。
   */
  | {
      type: "persona_partial";
      questions: string[];
      entry: QAEntry;
      completed: number;
      total: number;
    }
  /** 訪談全部結束 — 所有 entries 完整 payload，作為 session-update / 完成訊號 */
  | { type: "personas_qa"; questions: string[]; entries: QAEntry[] }
  | { type: "error"; message: string }
  | { type: "complete" };

export type ResearchBrief = {
  productConcept: string;
  keyQuestions: string[];
  targetSegment: string;
};

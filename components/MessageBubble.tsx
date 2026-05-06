"use client";

import type { Persona } from "@/lib/agents/personas-data";
import type { AgentName, QAEntry } from "@/lib/agents/types";
import { AgentBadge } from "./AgentBadge";
import { HighlightedText } from "./HighlightedText";

export type DisplayMessage = {
  id: string;
  role: "user" | "agent" | "phase-map" | "sankey" | "qa";
  agent?: AgentName;
  label?: string;
  text: string;
  streaming?: boolean;
  personas?: Persona[]; // for phase-map (受訪者點陣)
  qaQuestions?: string[]; // for qa-explorer messages
  qaEntries?: QAEntry[]; // for qa-explorer & sankey messages
};

export function MessageBubble({ msg }: { msg: DisplayMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-slate-700 rounded-2xl rounded-br-sm px-4 py-2.5 text-slate-100">
          {msg.text}
        </div>
      </div>
    );
  }

  // 對話者（persona）的回覆要把外送員術語標起來
  const cleanText = msg.text
    .replace(/\[STATUS:(READY|CLARIFY)\]/gi, "")
    .trimEnd();
  const isPersona = msg.agent === "persona";

  return (
    <div className="space-y-2">
      <AgentBadge agent={msg.agent ?? "entry"} label={msg.label} />
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 whitespace-pre-wrap leading-relaxed">
        {isPersona ? (
          <HighlightedText text={cleanText} />
        ) : (
          cleanText
        )}
        {msg.streaming && (
          <span className="inline-block w-2 h-4 ml-1 align-middle bg-slate-400 animate-pulse" />
        )}
      </div>
    </div>
  );
}

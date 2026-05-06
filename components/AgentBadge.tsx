"use client";

import type { AgentName } from "@/lib/agents/types";

const COLOR: Record<AgentName, string> = {
  entry: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  pm: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  persona: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  summary: "bg-amber-500/20 text-amber-300 border-amber-500/40",
};

const NAME: Record<AgentName, string> = {
  entry: "啟動者",
  pm: "觀測者",
  persona: "對話者",
  summary: "Summary Agent",
};

export function AgentBadge({
  agent,
  label,
}: {
  agent: AgentName;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${COLOR[agent]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {NAME[agent]}
      {label && <span className="text-current/70">· {label}</span>}
    </span>
  );
}

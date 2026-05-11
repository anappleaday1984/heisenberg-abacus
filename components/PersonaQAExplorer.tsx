"use client";

import { useState } from "react";
import type { QAEntry } from "@/lib/agents/types";
import { colorForPersona } from "@/lib/persona-scores";
import { HighlightedText } from "./HighlightedText";

type Props = {
  questions: string[];
  entries: QAEntry[];
  pageSize?: number;
  /** 點「看洞察報告」時呼叫 — 由 ChatInterface 提供 scroll 行為 */
  onJumpToSummary?: () => void;
  /** 預期受訪者總數（漸進式訪談用） */
  total?: number;
  /** 是否仍有受訪者尚未完成（漸進式訪談用） */
  streaming?: boolean;
};

export function PersonaQAExplorer({
  questions,
  entries,
  pageSize = 3,
  onJumpToSummary,
  total,
  streaming,
}: Props) {
  const [qIdx, setQIdx] = useState(0);
  const [pageIdx, setPageIdx] = useState(0);

  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const startEntry = pageIdx * pageSize;
  const visibleEntries = entries.slice(startEntry, startEntry + pageSize);
  const hasNextQ = qIdx < questions.length - 1;
  const hasMultiplePages = entries.length > pageSize;

  function nextQuestion() {
    // 同樣 3 位受訪者，看下一題（page index 不重設）
    if (hasNextQ) {
      setQIdx((i) => i + 1);
    } else {
      setQIdx(0);
    }
  }

  function nextPage() {
    setPageIdx((i) => (i + 1) % totalPages);
  }

  return (
    <div className="space-y-3 max-w-3xl mx-auto w-full">
      {/* === Question Card — 顯眼對話式方框 === */}
      <div className="relative bg-gradient-to-r from-blue-500/15 via-blue-500/10 to-violet-500/10 border-2 border-blue-500/40 rounded-2xl p-4 shadow-lg">
        <div className="absolute -top-2.5 left-4 bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md">
          觀測者提問
        </div>
        {/* 漸進式訪談進度條 — streaming 中時顯示「X / N 已回答」+ 脈動點 */}
        {streaming && total != null && (
          <div className="absolute -top-2.5 right-4 bg-emerald-500/90 text-white text-[10px] font-bold tracking-wider px-2.5 py-0.5 rounded-md flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
            </span>
            訪談中 {entries.length} / {total}
          </div>
        )}
        <div className="flex items-start gap-3 pt-1">
          <div className="bg-blue-600 text-white text-sm font-bold rounded-lg px-2.5 py-1.5 tabular-nums whitespace-nowrap shrink-0">
            Q{qIdx + 1} / {questions.length}
          </div>
          <p className="text-slate-50 text-base font-semibold leading-relaxed flex-1">
            {questions[qIdx]}
          </p>
        </div>
      </div>

      {/* === 三位代表的彩色回覆氣泡 === */}
      <div className="space-y-2">
        {visibleEntries.map((entry, i) => {
          const personaIdx = startEntry + i;
          const color = colorForPersona(entry.persona.id, personaIdx);
          const answer = entry.answers[qIdx]?.trim();
          return (
            <div
              key={entry.persona.id}
              className="rounded-xl p-3.5 border-l-4 relative"
              style={{
                backgroundColor: `${color}1a`, // 10% alpha
                borderLeftColor: color,
                borderTop: `1px solid ${color}33`,
                borderRight: `1px solid ${color}33`,
                borderBottom: `1px solid ${color}33`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0 border-2 border-slate-900"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  受訪者 #{String(personaIdx + 1).padStart(2, "0")}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-xs text-slate-400">
                  {entry.persona.archetype}
                </span>
                <span className="text-slate-600">·</span>
                <span
                  className="text-sm font-bold"
                  style={{ color }}
                >
                  {entry.persona.name}
                </span>
              </div>
              <div className="text-[13px] text-slate-100 leading-relaxed whitespace-pre-wrap">
                {answer ? (
                  <HighlightedText text={answer} />
                ) : (
                  <span className="text-slate-500 italic">（此題無回應）</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* === 操作按鈕 === */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-slate-400 leading-tight">
          <div>
            <span className="text-slate-500">問題進度：</span>
            <span className="text-slate-200 font-semibold tabular-nums">
              {qIdx + 1} / {questions.length}
            </span>
          </div>
          <div>
            <span className="text-slate-500">受訪者：</span>
            <span className="text-slate-200 font-semibold tabular-nums">
              {startEntry + 1}-
              {Math.min(startEntry + pageSize, entries.length)} / {entries.length}
            </span>
            <span className="text-slate-600 mx-1">·</span>
            <span className="text-slate-500">第</span>
            <span className="text-slate-200 font-semibold tabular-nums mx-0.5">
              {pageIdx + 1}/{totalPages}
            </span>
            <span className="text-slate-500">頁</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasMultiplePages && (
            <button
              type="button"
              onClick={nextPage}
              title="同一題，換另外 3 位受訪者的回覆"
              className="bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm px-3.5 py-2 rounded-lg font-medium border border-slate-600"
            >
              ↻ 看另外 {pageSize} 位受訪者的回覆
            </button>
          )}
          <button
            type="button"
            onClick={nextQuestion}
            title="同樣 3 位受訪者，看下一題"
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3.5 py-2 rounded-lg font-medium shadow-md"
          >
            {hasNextQ ? `→ 下一題（Q${qIdx + 2}）` : "↺ 從第 1 題重看"}
          </button>
          {onJumpToSummary && (
            <button
              type="button"
              onClick={onJumpToSummary}
              title="跳到下方的市場調查洞察報告"
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-3.5 py-2 rounded-lg font-medium shadow-md"
            >
              📊 看洞察報告
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

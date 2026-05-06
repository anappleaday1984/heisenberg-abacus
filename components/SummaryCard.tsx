"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { validateAndFixMarkdown } from "@/lib/output-validator";

type Tone = "positive" | "neutral" | "negative";

type Metric = {
  label: string;
  value: string;
  unit: string;
  tone: Tone;
  icon: string;
};

type Group = {
  name: string;
  score: number;
  highlight: string;
};

type SummaryData = {
  headline: string;
  keyTakeaway: string;
  metrics: Metric[];
  groups: Group[];
  sections: {
    consensus: string;
    divergence: string;
    metrics: string;
    risks: string;
  };
};

type Props = {
  text: string;
  streaming?: boolean;
  personaCount?: number;
};

const TONE_CLASSES: Record<
  Tone,
  { ring: string; text: string; bg: string }
> = {
  positive: {
    ring: "ring-emerald-500/40",
    text: "text-emerald-300",
    bg: "from-emerald-500/15 to-emerald-500/0",
  },
  neutral: {
    ring: "ring-blue-500/40",
    text: "text-blue-300",
    bg: "from-blue-500/15 to-blue-500/0",
  },
  negative: {
    ring: "ring-amber-500/40",
    text: "text-amber-300",
    bg: "from-amber-500/15 to-amber-500/0",
  },
};

const SECTION_DEF: Array<{
  key: keyof SummaryData["sections"];
  title: string;
  icon: string;
  bg: string;
  border: string;
  text: string;
}> = [
  {
    key: "consensus",
    title: "共識洞察",
    icon: "🎯",
    bg: "bg-blue-500/10",
    border: "border-blue-500",
    text: "text-blue-300",
  },
  {
    key: "divergence",
    title: "群體分歧",
    icon: "⚡",
    bg: "bg-violet-500/10",
    border: "border-violet-500",
    text: "text-violet-300",
  },
  {
    key: "metrics",
    title: "量化指標",
    icon: "📈",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500",
    text: "text-emerald-300",
  },
  {
    key: "risks",
    title: "風險訊號",
    icon: "⚠️",
    bg: "bg-amber-500/10",
    border: "border-amber-500",
    text: "text-amber-300",
  },
];

function scoreColor(score: number): string {
  if (score >= 70) return "from-emerald-400 to-emerald-500";
  if (score >= 50) return "from-blue-400 to-blue-500";
  if (score >= 30) return "from-amber-400 to-amber-500";
  return "from-red-400 to-red-500";
}

function tryParseSummary(text: string): SummaryData | null {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as SummaryData;
  } catch {
    return null;
  }
}

export function SummaryCard({ text, streaming, personaCount }: Props) {
  const data = useMemo(() => tryParseSummary(text), [text]);
  const today = new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // Loading / fallback states
  if (!data) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span>{streaming ? "Summary Agent 正在生成洞察報告..." : "報告載入中"}</span>
        </div>
        {!streaming && text && (
          <pre className="mt-4 text-xs text-red-300 whitespace-pre-wrap">
            {text.slice(0, 400)}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-3xl mx-auto w-full">
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl">
        {/* === Header === */}
        <header className="border-b border-slate-700/60 pb-4 mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-2xl">
              📊
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-100">
                市場調查洞察報告
              </h2>
              <p className="text-sm text-slate-300 mt-0.5 leading-snug">
                {data.headline}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Summary Agent · {today}
                {typeof personaCount === "number" &&
                  personaCount > 0 &&
                  ` · 訪談 ${personaCount} 位受訪者`}
              </p>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 text-right leading-tight whitespace-nowrap">
            <div>海森堡的算盤</div>
            <div className="text-slate-600">人類行為觀測站</div>
          </div>
        </header>

        {/* === Key Takeaway hero === */}
        {data.keyTakeaway && (
          <div className="mb-5 bg-gradient-to-r from-blue-500/15 via-violet-500/15 to-blue-500/15 border border-blue-500/30 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">💡</span>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-blue-300 font-semibold mb-1">
                Key Takeaway · 行動建議
              </div>
              <div className="text-slate-100 text-sm font-medium leading-relaxed">
                {data.keyTakeaway}
              </div>
            </div>
          </div>
        )}

        {/* === KPI Metrics Row === */}
        {data.metrics.length > 0 && (
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
              📌 關鍵指標
            </div>
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${Math.min(4, data.metrics.length)}, minmax(0, 1fr))`,
              }}
            >
              {data.metrics.map((m, i) => {
                const tc = TONE_CLASSES[m.tone];
                return (
                  <div
                    key={i}
                    className={`bg-gradient-to-b ${tc.bg} bg-slate-800/40 border border-slate-700 ring-1 ${tc.ring} rounded-xl p-3`}
                  >
                    <div className="flex items-center gap-1 text-base">
                      <span>{m.icon}</span>
                    </div>
                    <div
                      className={`mt-1 text-2xl font-bold ${tc.text} tabular-nums leading-none`}
                    >
                      {m.value}
                      {m.unit && (
                        <span className="text-sm font-medium ml-0.5 opacity-80">
                          {m.unit}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 leading-tight">
                      {m.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* === Group Bar Chart === */}
        {data.groups.length > 0 && (
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
              📊 各族群支持度（0-100）
            </div>
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-3 space-y-2">
              {data.groups.map((g, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-300 font-medium">{g.name}</span>
                    <span className="text-slate-100 tabular-nums font-bold">
                      {g.score}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${scoreColor(g.score)} rounded-full`}
                      style={{ width: `${g.score}%` }}
                    />
                  </div>
                  {g.highlight && (
                    <div className="text-[10px] text-slate-500 mt-1 leading-tight">
                      {g.highlight}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === Sections (4 colored cards) === */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SECTION_DEF.map((def) => {
            const body = data.sections[def.key];
            if (!body) return null;
            return (
              <div
                key={def.key}
                className={`${def.bg} border-l-4 ${def.border} rounded-r-lg p-3.5`}
              >
                <h3
                  className={`${def.text} text-sm font-semibold flex items-center gap-1.5 mb-2`}
                >
                  <span className="text-base">{def.icon}</span>
                  {def.title}
                </h3>
                <div
                  className="text-[12.5px] text-slate-200 leading-relaxed"
                  style={{ wordBreak: "break-word" }}
                >
                  <ReactMarkdown
                    components={{
                      ul: ({ children }) => (
                        <ul className="list-disc list-outside ml-4 space-y-0.5">
                          {children}
                        </ul>
                      ),
                      li: ({ children }) => (
                        <li className="text-slate-200">{children}</li>
                      ),
                      p: ({ children }) => (
                        <p className="mb-1 last:mb-0">{children}</p>
                      ),
                      strong: ({ children }) => (
                        <strong className="text-slate-100 font-semibold">
                          {children}
                        </strong>
                      ),
                    }}
                  >
                    {validateAndFixMarkdown(body).fixed}
                  </ReactMarkdown>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="mt-5 pt-3 border-t border-slate-800 text-[10px] text-slate-500 text-center">
          Multi-agent virtual persona market research · 自動產生圖卡
        </footer>
      </div>

    </div>
  );
}

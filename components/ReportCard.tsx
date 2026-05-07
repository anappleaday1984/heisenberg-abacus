"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { FullReportPayload } from "@/lib/orchestrator";
import type { Persona } from "@/lib/agents/personas-data";

type Props = {
  text: string;
  streaming?: boolean;
};

const TONE_CLS: Record<
  "positive" | "neutral" | "negative",
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

const PRIORITY_BADGE: Record<
  "high" | "medium" | "low",
  { bg: string; border: string; text: string; label: string }
> = {
  high: {
    bg: "bg-red-500/15",
    border: "border-red-500/50",
    text: "text-red-300",
    label: "高優先",
  },
  medium: {
    bg: "bg-amber-500/15",
    border: "border-amber-500/50",
    text: "text-amber-300",
    label: "中優先",
  },
  low: {
    bg: "bg-slate-600/30",
    border: "border-slate-500/50",
    text: "text-slate-300",
    label: "低優先",
  },
};

function tryParse(text: string): FullReportPayload | null {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as FullReportPayload;
  } catch {
    return null;
  }
}

function scoreColor(score: number): string {
  if (score >= 70) return "from-emerald-400 to-emerald-500";
  if (score >= 50) return "from-blue-400 to-blue-500";
  if (score >= 30) return "from-amber-400 to-amber-500";
  return "from-red-400 to-red-500";
}

function demographicsSummary(personas: Persona[]) {
  if (personas.length === 0) {
    return { ageRange: "—", incomeRange: "—", maleCount: 0, femaleCount: 0 };
  }
  const ages = personas.map((p) => p.age);
  const incomes = personas.map((p) => p.yearlyIncomeTWD);
  return {
    ageRange: `${Math.min(...ages)}-${Math.max(...ages)} 歲`,
    incomeRange: `${Math.min(...incomes).toLocaleString()}-${Math.max(...incomes).toLocaleString()} 元/年`,
    maleCount: personas.filter((p) => p.gender === "男").length,
    femaleCount: personas.filter((p) => p.gender === "女").length,
  };
}

export function ReportCard({ text, streaming }: Props) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const data = useMemo(() => tryParse(text), [text]);

  const today = useMemo(() => {
    const d = data?.generatedAt ? new Date(data.generatedAt) : new Date();
    return d.toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }, [data?.generatedAt]);

  if (!data) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          <span>{streaming ? "觀測者正在編寫決策報告..." : "報告載入中"}</span>
        </div>
        {!streaming && text && (
          <pre className="mt-4 text-xs text-red-300 whitespace-pre-wrap">
            {text.slice(0, 400)}
          </pre>
        )}
      </div>
    );
  }

  const { report, summary, plan, personas } = data;
  const demo = demographicsSummary(personas);

  async function captureCanvas() {
    if (!reportRef.current) return null;
    const html2canvas = (await import("html2canvas")).default;
    return html2canvas(reportRef.current, {
      backgroundColor: "#0b1020",
      scale: 2,
      useCORS: true,
      logging: false,
    });
  }


  async function downloadPdf() {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const canvas = await captureCanvas();
      if (!canvas) return;
      const { jsPDF } = await import("jspdf");
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      // 多頁切分（如果報告超過 A4 一頁）
      let position = 0;
      let remaining = imgH;
      while (remaining > 0) {
        pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
        remaining -= pageH;
        position -= pageH;
        if (remaining > 0) pdf.addPage();
      }
      pdf.save(`report-${Date.now()}.pdf`);
    } catch (e) {
      alert("PDF 下載失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <div className="space-y-3 max-w-4xl mx-auto w-full">
      <div
        ref={reportRef}
        className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-7 shadow-2xl"
      >
        {/* === 報告封面 Header === */}
        <header className="border-b-2 border-violet-500/30 pb-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-2xl">
                📋
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-violet-400 font-semibold">
                  Final Decision Report · 觀測者 · 回報結果
                </div>
                <h1 className="text-xl font-bold text-slate-50 mt-1 leading-tight">
                  {report.title}
                </h1>
              </div>
            </div>
            <div className="text-right text-[10px] text-slate-500 leading-tight whitespace-nowrap">
              <div className="text-slate-300 font-semibold">海森堡的算盤</div>
              <div>人類行為觀測站</div>
              <div className="mt-1">{today}</div>
            </div>
          </div>
        </header>

        {/* === 1. 研究命題 === */}
        <Section title="研究命題" icon="📝" colorBar="bg-blue-500">
          <div className="bg-blue-500/10 border-l-4 border-blue-500 rounded-r p-3 space-y-2">
            <div className="text-slate-100 text-sm font-medium leading-relaxed">
              {plan.summary}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-blue-300 font-semibold mb-1">
                訪談問題（{plan.questions.length} 題）
              </div>
              <ol className="list-decimal list-outside ml-4 text-[12.5px] text-slate-300 space-y-0.5">
                {plan.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </div>
          </div>
        </Section>

        {/* === 2. 執行摘要 === */}
        <Section title="執行摘要" icon="📊" colorBar="bg-violet-500">
          <div className="bg-gradient-to-r from-violet-500/15 via-blue-500/10 to-violet-500/15 border border-violet-500/30 rounded-xl p-4">
            <div className="text-slate-100 text-sm leading-relaxed">
              {report.executiveSummary}
            </div>
          </div>
        </Section>

        {/* === 3. 重點發現 === */}
        <Section title={`重點發現（${report.keyFindings.length} 項）`} icon="🎯" colorBar="bg-emerald-500">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {report.keyFindings.map((f, i) => {
              const tone = f.metric?.tone ?? "neutral";
              const tc = TONE_CLS[tone];
              return (
                <div
                  key={i}
                  className={`bg-gradient-to-b ${tc.bg} bg-slate-800/40 border border-slate-700 ring-1 ${tc.ring} rounded-xl p-3.5`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg">{f.icon}</span>
                      <span className="text-[11px] text-slate-400 font-semibold tabular-nums">
                        # {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    {f.metric && (
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${tc.text} tabular-nums leading-none`}>
                          {f.metric.value}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {f.metric.label}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-slate-100 text-sm font-semibold mb-1">
                    {f.title}
                  </div>
                  <div className="text-slate-200 text-[12.5px] font-medium leading-snug mb-1.5">
                    {f.headline}
                  </div>
                  <div className="text-slate-400 text-[12px] leading-relaxed">
                    {f.details}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* === 4. 族群比較表 === */}
        {report.groupComparison.rows.length > 0 && (
          <Section title="族群比較" icon="📊" colorBar="bg-amber-500">
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full text-xs">
                <thead className="bg-slate-800/80 text-slate-300">
                  <tr>
                    {report.groupComparison.headers.map((h, i) => (
                      <th
                        key={i}
                        className="px-3 py-2 text-left font-semibold border-b border-slate-700"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-slate-900/40">
                  {report.groupComparison.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className="border-b border-slate-800 last:border-0"
                    >
                      {row.map((cell, ci) => {
                        // 第 2 欄如果是純數字，畫 mini bar
                        const isScoreColumn = ci === 1 && /^\d+$/.test(cell);
                        return (
                          <td
                            key={ci}
                            className="px-3 py-2 text-slate-200 align-top"
                          >
                            {isScoreColumn ? (
                              <div className="flex items-center gap-2">
                                <span className="tabular-nums font-bold w-8">
                                  {cell}
                                </span>
                                <div className="flex-1 h-1.5 bg-slate-800 rounded-full min-w-[40px] overflow-hidden">
                                  <div
                                    className={`h-full bg-gradient-to-r ${scoreColor(Number(cell))}`}
                                    style={{ width: `${Math.min(100, Number(cell))}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              cell
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* === 5. 受訪者背景 === */}
        <Section title={`受訪者背景說明（${personas.length} 位）`} icon="👥" colorBar="bg-cyan-500">
          {/* 統計 chips */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <StatChip icon="👤" label="總人數" value={`${personas.length}`} unit="位" />
            <StatChip icon="🎂" label="年齡範圍" value={demo.ageRange} />
            <StatChip icon="💰" label="年收入" value={demo.incomeRange} />
            <StatChip
              icon="⚖️"
              label="性別比"
              value={`男 ${demo.maleCount} · 女 ${demo.femaleCount}`}
            />
          </div>

          {/* 受訪者小表 */}
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-[11.5px]">
              <thead className="bg-slate-800/80 text-slate-300">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">#</th>
                  <th className="px-2 py-1.5 text-left font-semibold">類型</th>
                  <th className="px-2 py-1.5 text-left font-semibold">別稱</th>
                  <th className="px-2 py-1.5 text-left font-semibold">性別/齡</th>
                  <th className="px-2 py-1.5 text-right font-semibold">年收入 (元)</th>
                  <th className="px-2 py-1.5 text-left font-semibold">家庭簡述</th>
                </tr>
              </thead>
              <tbody className="bg-slate-900/40">
                {personas.map((p, i) => (
                  <tr
                    key={p.id}
                    className="border-t border-slate-800 hover:bg-slate-800/40"
                  >
                    <td className="px-2 py-1.5 text-slate-500 tabular-nums">{i + 1}</td>
                    <td className="px-2 py-1.5 text-slate-300">{p.archetype}</td>
                    <td className="px-2 py-1.5 text-slate-100 font-medium">{p.name}</td>
                    <td className="px-2 py-1.5 text-slate-300 whitespace-nowrap">
                      {p.gender} / {p.age}
                    </td>
                    <td className="px-2 py-1.5 text-right text-slate-300 tabular-nums">
                      {p.yearlyIncomeTWD.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-slate-400 max-w-[24ch] truncate" title={p.family}>
                      {p.family}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* === 6. 受訪者回答匯總（從 summary 借用 KPI + group bars） === */}
        <Section title="受訪者回答匯總" icon="📈" colorBar="bg-blue-500">
          {/* KPI 條 */}
          {summary.metrics.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {summary.metrics.map((m, i) => {
                const tc = TONE_CLS[m.tone];
                return (
                  <div
                    key={i}
                    className={`bg-gradient-to-b ${tc.bg} bg-slate-800/30 border border-slate-700 ring-1 ${tc.ring} rounded-lg p-2.5`}
                  >
                    <div className="text-base">{m.icon}</div>
                    <div className={`text-lg font-bold ${tc.text} tabular-nums leading-none mt-0.5`}>
                      {m.value}
                      {m.unit && <span className="text-xs opacity-80 ml-0.5">{m.unit}</span>}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                      {m.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Group bars */}
          {summary.groups.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                各族群支持度（0-100）
              </div>
              {summary.groups.map((g, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <span className="text-slate-200 font-medium">{g.name}</span>
                    <span className="text-slate-100 tabular-nums font-bold">
                      {g.score}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${scoreColor(g.score)} rounded-full`}
                      style={{ width: `${g.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* === 7. 下一步行動建議 === */}
        <Section
          title={`下一步行動建議（${report.actionItems.length} 項）`}
          icon="🚀"
          colorBar="bg-red-500"
          last
        >
          <div className="space-y-2">
            {report.actionItems.map((a, i) => {
              const pb = PRIORITY_BADGE[a.priority];
              return (
                <div
                  key={i}
                  className={`${pb.bg} border ${pb.border} rounded-lg p-3 flex items-start gap-3`}
                >
                  <div className="text-xl text-slate-500 font-bold tabular-nums mt-0.5">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${pb.border} ${pb.text}`}
                      >
                        {pb.label}
                      </span>
                      <span className="text-slate-100 text-sm font-semibold">
                        {a.title}
                      </span>
                    </div>
                    <div className="text-slate-200 text-[12.5px] leading-relaxed mb-1">
                      <span className="text-slate-400">▸ 行動：</span>
                      {a.action}
                    </div>
                    <div className="text-slate-300 text-[12.5px] leading-relaxed">
                      <span className="text-slate-400">▸ 預期效果：</span>
                      {a.expectedImpact}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <footer className="mt-6 pt-3 border-t border-slate-800 text-[10px] text-slate-500 text-center">
          Multi-agent virtual persona market research · 自動產生報告 · 海森堡的算盤 © {new Date().getFullYear()}
        </footer>
      </div>

      {/* 下載 + 進入動態模擬 */}
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={downloadPdf}
          disabled={downloadingPdf || streaming}
          className="bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm px-4 py-2 rounded-lg font-medium"
        >
          {downloadingPdf ? "產生 PDF..." : "⬇ 下載完整報告 (PDF)"}
        </button>
        <Link
          href="/simulation"
          title="動態模擬 — 行為相變散佈圖、外在變因下的決策變化"
          className="inline-flex items-center bg-violet-600 hover:bg-violet-500 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
        >
          🛰 進入動態模擬 →
        </Link>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  colorBar,
  last,
  children,
}: {
  title: string;
  icon: string;
  colorBar: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={last ? "" : "mb-5"}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-1 h-5 ${colorBar} rounded-full`} />
        <span className="text-base">{icon}</span>
        <h2 className="text-sm font-bold text-slate-100 tracking-wide">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function StatChip({
  icon,
  label,
  value,
  unit,
}: {
  icon: string;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-lg px-2.5 py-2">
      <div className="text-[10px] text-slate-400 flex items-center gap-1">
        <span>{icon}</span>
        {label}
      </div>
      <div className="text-slate-100 text-sm font-bold mt-0.5 tabular-nums leading-tight">
        {value}
        {unit && <span className="text-xs ml-0.5 font-normal opacity-80">{unit}</span>}
      </div>
    </div>
  );
}

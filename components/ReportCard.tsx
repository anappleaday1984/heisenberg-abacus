"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FullReportPayload } from "@/lib/orchestrator";
import type { Persona } from "@/lib/agents/personas-data";
import {
  VOICE_DOWNLOAD_PDF_EVENT,
  VOICE_EMAIL_REPORT_EVENT,
} from "./VoiceControl";

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

const DEFAULT_EMAIL_TO = "the.ai.hack.project@gmail.com";

export function ReportCard({ text, streaming }: Props) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);
  // 點「寄信」會打開這個 popup，使用者確認 / 修改收件人後才真送
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(DEFAULT_EMAIL_TO);

  const data = useMemo(() => tryParse(text), [text]);

  const today = useMemo(() => {
    const d = data?.generatedAt ? new Date(data.generatedAt) : new Date();
    return d.toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }, [data?.generatedAt]);

  // 語音指令 — 監聽 VoiceControl 派發的 CustomEvent，依動作自動寄信 / 下載 PDF。
  // 這些 ref 在「報告 ready」的 render 路徑會被指派最新 callback / 條件；
  // 沒 ready 時保留上一輪值或初始 null/false，handler 會因 canActRef=false 直接 bail out。
  const emailReportRef = useRef<((to?: string) => Promise<void>) | null>(null);
  const downloadPdfRef = useRef<(() => Promise<void>) | null>(null);
  const openEmailModalRef = useRef<((prefill?: string) => void) | null>(null);
  const canActRef = useRef(false);
  useEffect(() => {
    async function emailHandler() {
      if (!canActRef.current) return;
      // 收件人決策：udo 帳號用預設信箱直送；其他帳號開 modal 讓使用者填收件人。
      // User type 沒有 email 欄位，所以只能用 account 名稱判斷；其他帳號的 email
      // 沒地方推得出來。fetch 失敗就 fallback 開 modal — 寧可多一步確認也不要
      // 把報告寄錯地方。
      try {
        const res = await fetch("/api/auth/me");
        const body: { user?: { account?: string } | null } = await res.json();
        if (body.user?.account === "udo") {
          void emailReportRef.current?.(DEFAULT_EMAIL_TO);
        } else {
          // 非 udo：開 modal 並把欄位清空，強迫使用者自填要寄到的信箱
          openEmailModalRef.current?.("");
        }
      } catch {
        openEmailModalRef.current?.("");
      }
    }
    function downloadHandler() {
      if (!canActRef.current) return;
      void downloadPdfRef.current?.();
    }
    window.addEventListener(VOICE_EMAIL_REPORT_EVENT, emailHandler);
    window.addEventListener(VOICE_DOWNLOAD_PDF_EVENT, downloadHandler);
    return () => {
      window.removeEventListener(VOICE_EMAIL_REPORT_EVENT, emailHandler);
      window.removeEventListener(VOICE_DOWNLOAD_PDF_EVENT, downloadHandler);
    };
  }, []);

  if (!data) {
    canActRef.current = false;
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

  // 抓 DOM → canvas
  // - download：用 PNG 高保真（scale 2、不壓縮）
  // - email：用 JPEG 0.85 + scale 1.5，把 PDF 從 30+ MB 壓到 < 5 MB（Gmail 附件 25 MB 上限）
  async function captureCanvas(opts?: { scale?: number }) {
    if (!reportRef.current) return null;
    const html2canvas = (await import("html2canvas")).default;
    return html2canvas(reportRef.current, {
      backgroundColor: "#0b1020",
      scale: opts?.scale ?? 2,
      useCORS: true,
      logging: false,
    });
  }

  // 共用：產生 jsPDF 物件（多頁切分）。
  // compact=true 時用 JPEG + 小 scale，給寄信用（避免超過 Gmail 25 MB 附件上限）
  async function buildPdf(opts?: { compact?: boolean }) {
    const compact = opts?.compact ?? false;
    const canvas = await captureCanvas({ scale: compact ? 1.5 : 2 });
    if (!canvas) return null;
    const { jsPDF } = await import("jspdf");
    const imgData = compact
      ? canvas.toDataURL("image/jpeg", 0.85)
      : canvas.toDataURL("image/png");
    const fmt = compact ? "JPEG" : "PNG";
    const pdf = new jsPDF({
      orientation: "p",
      unit: "mm",
      format: "a4",
      compress: true,
    });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    let position = 0;
    let remaining = imgH;
    while (remaining > 0) {
      pdf.addImage(imgData, fmt, 0, position, imgW, imgH);
      remaining -= pageH;
      position -= pageH;
      if (remaining > 0) pdf.addPage();
    }
    return pdf;
  }

  async function downloadPdf() {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const pdf = await buildPdf();
      if (!pdf) return;
      pdf.save(`report-${Date.now()}.pdf`);
    } catch (e) {
      alert("PDF 下載失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDownloadingPdf(false);
    }
  }

  // prefill = "" 代表「請使用者自填」（語音 + 非 udo 帳號的場景）；undefined 用
  // DEFAULT_EMAIL_TO 預填（按鈕 click 場景，udo 自己用比較方便）。
  function openEmailModal(prefill?: string) {
    if (emailing) return;
    setEmailTo(prefill !== undefined ? prefill : DEFAULT_EMAIL_TO);
    setEmailStatus(null);
    setEmailModalOpen(true);
  }

  async function emailReport(toOverride?: string) {
    if (emailing || !data) return;
    setEmailing(true);
    setEmailStatus(null);
    try {
      // compact 版（JPEG + 小 scale）— 寄信用，附件大小遠小於 Gmail 25 MB 限制
      const pdf = await buildPdf({ compact: true });
      if (!pdf) {
        setEmailStatus({ kind: "err", msg: "PDF 產生失敗" });
        return;
      }
      // jsPDF.output('datauristring') 含 "data:application/pdf;base64,..." 前綴
      // 撕掉前綴只送純 base64，server 才好 Buffer.from(b64, 'base64')
      const dataUri = pdf.output("datauristring");
      const pdfBase64 = dataUri.replace(/^data:[^,]+,/, "");

      const targetTo = (toOverride ?? emailTo).trim() || DEFAULT_EMAIL_TO;
      const res = await fetch("/api/email-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data,
          pdfBase64,
          to: targetTo,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setEmailStatus({
          kind: "err",
          msg: err.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      const ok = await res.json();
      setEmailStatus({
        kind: "ok",
        msg: `已寄至 ${ok.to}（PDF + Markdown 附件）`,
      });
      // 成功後關閉 popup，讓 banner 顯示在按鈕區下方
      setEmailModalOpen(false);
    } catch (e) {
      setEmailStatus({
        kind: "err",
        msg: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setEmailing(false);
    }
  }

  // 同步 ref 給語音事件 handler 用（hook 在前面已註冊，這裡只做指派）
  emailReportRef.current = emailReport;
  downloadPdfRef.current = downloadPdf;
  openEmailModalRef.current = openEmailModal;
  canActRef.current = !emailing && !downloadingPdf && !streaming && !!data;

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

      {/* 下載 + 寄信 + 進入動態模擬 */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={downloadPdf}
            disabled={downloadingPdf || streaming}
            className="bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm px-4 py-2 rounded-lg font-medium"
          >
            {downloadingPdf ? "產生 PDF..." : "⬇ 下載完整報告 (PDF)"}
          </button>
          <button
            type="button"
            onClick={() => openEmailModal()}
            disabled={emailing || downloadingPdf || streaming}
            title="開啟寄信視窗"
            // disabled 仍含 downloadingPdf(避免 html2canvas 並發抓 DOM 出怪結果),
            // 但 visually 只在「真正寄信中」或「主對話 streaming 中」才變灰 — 下載時
            // 寄信按鈕維持原色,讓使用者清楚是哪顆按鈕在動作。
            className={`text-white text-sm px-4 py-2 rounded-lg font-medium ${
              emailing || streaming
                ? "bg-slate-700 text-slate-500"
                : "bg-amber-600 hover:bg-amber-500"
            }`}
          >
            ✉ 寄信
          </button>
          <Link
            href="/simulation"
            title="動態模擬 — 行為相變散佈圖、外在變因下的決策變化"
            className="inline-flex items-center bg-violet-600 hover:bg-violet-500 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
          >
            🛰 進入動態模擬 →
          </Link>
        </div>
        {emailStatus && !emailModalOpen && (
          <div
            className={`text-xs px-3 py-1.5 rounded-md border ${
              emailStatus.kind === "ok"
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                : "bg-red-500/10 border-red-500/40 text-red-300"
            }`}
          >
            {emailStatus.kind === "ok" ? "✓" : "✗"} {emailStatus.msg}
          </div>
        )}
      </div>

      {/* === 寄信 modal === */}
      {emailModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !emailing) {
              setEmailModalOpen(false);
            }
          }}
        >
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-slate-700/60">
              <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">
                寄信
              </div>
              <h3 className="text-base font-bold text-slate-50">
                寄出完整報告（PDF + Markdown）
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                附件含 PDF 報告與 Markdown 文字檔，可改收件人。
              </p>
            </div>

            <div className="px-5 py-4 space-y-3">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  收件人
                </span>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  disabled={emailing}
                  placeholder={DEFAULT_EMAIL_TO}
                  className="mt-1 w-full bg-slate-950/60 border border-slate-700 focus:border-amber-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 disabled:opacity-50"
                />
              </label>

              {emailStatus?.kind === "err" && (
                <div className="text-xs px-3 py-2 rounded-md border bg-red-500/10 border-red-500/40 text-red-300">
                  ✗ {emailStatus.msg}
                </div>
              )}
            </div>

            <div className="px-5 pb-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !emailing && setEmailModalOpen(false)}
                disabled={emailing}
                className="text-sm px-4 py-2 rounded-lg font-medium text-slate-300 hover:text-slate-100 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void emailReport()}
                disabled={emailing || !emailTo.trim()}
                className="bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm px-4 py-2 rounded-lg font-medium"
              >
                {emailing ? "寄送中..." : "送出"}
              </button>
            </div>
          </div>
        </div>
      )}
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

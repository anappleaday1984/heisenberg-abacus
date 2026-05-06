"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { validateAndFixMarkdown } from "@/lib/output-validator";

type Props = {
  text: string;
  streaming?: boolean;
  onPickOption?: (opt: string) => void;
};

type Clarification = { reason: string; options: string[] };

/**
 * 容錯偵測 clarification 模式 — 接受三種格式：
 *   1. 標準：[CLARIFY]\n{json}        ← prompt 規定的格式
 *   2. 容錯：直接吐 raw JSON 含 reason + options
 *   3. 容錯：```json fenced 包 JSON
 *
 * model 不照規定時 UI 仍能正確 render（不會把 JSON 當 markdown 顯示）。
 */
function isClarifyResponse(trimmed: string): boolean {
  if (trimmed.startsWith("[CLARIFY]")) return true;
  // raw JSON / fenced JSON — 開頭有 reason / options key 就視為 clarify
  if (/^\s*(?:```(?:json)?\s*)?\{\s*"(reason|options)"/.test(trimmed)) {
    return true;
  }
  return false;
}

function parseClarification(text: string): Clarification | null {
  const trimmed = text.trim();
  if (!isClarifyResponse(trimmed)) return null;
  // 撈出 JSON：第一個 { 到最後一個 }
  const startBrace = trimmed.indexOf("{");
  const endBrace = trimmed.lastIndexOf("}");
  if (startBrace < 0 || endBrace <= startBrace) return null;
  try {
    const obj = JSON.parse(trimmed.slice(startBrace, endBrace + 1));
    if (
      typeof obj.reason === "string" &&
      Array.isArray(obj.options) &&
      obj.options.length > 0
    ) {
      return {
        reason: obj.reason,
        options: obj.options.map((s: unknown) => String(s)),
      };
    }
  } catch {
    /* JSON 還沒 stream 完，等下一個 tick */
  }
  return null;
}

export function QueryResponseBubble({ text, streaming, onPickOption }: Props) {
  const trimmed = text.trim();
  const isClarifyMode = isClarifyResponse(trimmed);
  const clarification = isClarifyMode ? parseClarification(text) : null;

  // 過 validator：自動修復 LLM 偶爾把 markdown table 寫成單行的問題
  const cleanText = useMemo(
    () => validateAndFixMarkdown(text).fixed,
    [text]
  );

  // 等待第一個 token 期間的「查找中... N%」進度模擬（漸近到 95%）
  const [waitingPct, setWaitingPct] = useState(0);
  useEffect(() => {
    if (text || !streaming) {
      setWaitingPct(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      // 5 秒到 ~63%、10 秒 ~86%、15 秒 ~95%
      const next = Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / 5000))));
      setWaitingPct(next);
    }, 120);
    return () => clearInterval(id);
  }, [text, streaming]);
  return (
    <div className="space-y-2">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        觀測者 · {isClarifyMode ? "請確認查詢意圖" : "查閱資料"}
      </span>

      {/* === Clarification mode === */}
      {isClarifyMode && (
        <div className="bg-slate-800/60 border border-amber-500/30 rounded-xl px-5 py-4 text-slate-100">
          {clarification ? (
            <>
              <div className="flex items-start gap-2 mb-3">
                <span className="text-xl">🤔</span>
                <div className="text-sm text-slate-200 leading-relaxed">
                  <span className="text-amber-300 font-semibold">原因：</span>
                  {clarification.reason}
                </div>
              </div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                請點選你想問的完整問題
              </div>
              <div className="space-y-1.5">
                {clarification.options.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onPickOption?.(opt)}
                    disabled={!onPickOption || streaming}
                    className="w-full text-left bg-slate-900/60 hover:bg-slate-700/60 border border-slate-700 hover:border-cyan-500 rounded-lg px-3 py-2 text-[13px] text-slate-100 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-start gap-2"
                  >
                    <span className="text-cyan-400 font-bold tabular-nums shrink-0">
                      {i + 1}.
                    </span>
                    <span>{opt}</span>
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-slate-500 mt-3">
                💡 也可以直接在下方對話框打入更具體的問題
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>正在分析查詢意圖...</span>
            </div>
          )}
        </div>
      )}

      {/* === Normal answer mode === */}
      {!isClarifyMode && (
      <div className="bg-slate-800/60 border border-cyan-500/30 rounded-xl px-5 py-4 text-slate-100 leading-relaxed">
        {text ? (
          <div className="space-y-3">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-base font-bold text-cyan-100 border-b border-cyan-500/30 pb-1.5 mb-2">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-[15px] font-bold text-slate-100 mt-3 mb-1.5 flex items-center gap-1.5">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-semibold text-cyan-300 mt-2 mb-1">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="text-[13.5px] mb-1.5 last:mb-0 leading-relaxed">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-outside ml-5 space-y-0.5 text-[13.5px]">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-outside ml-5 space-y-0.5 text-[13.5px]">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="text-slate-200 leading-relaxed">{children}</li>
                ),
                strong: ({ children }) => (
                  <strong className="text-cyan-200 font-semibold">
                    {children}
                  </strong>
                ),
                em: ({ children }) => (
                  <em className="text-slate-300 italic">{children}</em>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-cyan-500/60 bg-slate-900/40 pl-3 pr-2 py-1.5 my-2 italic text-slate-300 text-[13px]">
                    {children}
                  </blockquote>
                ),
                code: ({ children }) => (
                  <code className="bg-slate-900 text-cyan-200 px-1 py-0.5 rounded text-xs font-mono">
                    {children}
                  </code>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto my-2">
                    <table className="w-full text-xs border border-slate-700 rounded">
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="bg-slate-900 text-slate-300 font-semibold px-2 py-1 border-b border-slate-700 text-left">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-2 py-1 border-b border-slate-800 text-slate-200">
                    {children}
                  </td>
                ),
                hr: () => <hr className="border-slate-700 my-3" />,
              }}
            >
              {cleanText}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-300">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>查找中...</span>
              </div>
              <span className="text-cyan-300 font-bold tabular-nums">
                {waitingPct}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-150"
                style={{ width: `${waitingPct}%` }}
              />
            </div>
          </div>
        )}
        {streaming && text && (
          <span className="inline-block w-2 h-4 ml-1 align-middle bg-cyan-400 animate-pulse" />
        )}
      </div>
      )}
    </div>
  );
}

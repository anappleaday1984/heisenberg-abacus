"use client";

import { useState } from "react";
import type { Persona } from "@/lib/agents/personas-data";

const EXAMPLES = [
  "給我 5 位年齡 28-30、年薪約 100 萬的入門工程師，都沒有家庭",
  "增加 3 位 50 歲以上、有慢性病、需要長期借錢看病的長者",
  "新增 2 位剛退伍 22-25 歲、想創業缺資金的年輕人",
  "加 4 位月收 3-5 萬的單親媽媽，要養 1-2 個小孩",
];

type Props = {
  onGenerated: (newPersonas: Persona[]) => void;
};

export function PersonaGenerator({ onGenerated }: Props) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/personas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "generation failed");

      onGenerated(data.newPersonas);
      const summary = (data.newPersonas as Persona[])
        .map((p) => `${p.archetype}：${p.name}`)
        .join("、");
      setStatus({
        kind: "success",
        text: `✅ 已新增 ${data.added} 位（總計 ${data.total} 位）— ${summary}。對話介面下次發問即套用。`,
      });
      setPrompt("");
    } catch (e) {
      setStatus({
        kind: "error",
        text: `⚠️ ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-violet-950/30 border border-violet-700/40 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-violet-300">🤖</span>
        <h2 className="text-sm font-semibold text-slate-200">AI 生成受訪者</h2>
        <span className="text-xs text-slate-400">
          — 用自然語言描述要擴充的角色，自動生成並寫入
        </span>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
        }}
        placeholder="例：給我 5 位年齡 28-30、年薪約 100 萬的入門工程師，都沒有家庭"
        rows={3}
        disabled={busy}
        className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 disabled:opacity-50 leading-relaxed"
      />

      <div className="flex flex-wrap items-start gap-2">
        <button
          onClick={generate}
          disabled={busy || !prompt.trim()}
          className="bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
        >
          {busy ? "生成中..." : "✨ 生成並加入"}
        </button>
        <span className="text-xs text-slate-500 self-center">
          ⌘/Ctrl + Enter 快捷送出
        </span>
        <div className="basis-full" />
        <span className="text-xs text-slate-500 self-center">範例：</span>
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setPrompt(ex)}
            disabled={busy}
            className="text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded px-2 py-1 disabled:opacity-50"
            title={ex}
          >
            {ex.length > 22 ? ex.slice(0, 22) + "…" : ex}
          </button>
        ))}
      </div>

      {status && (
        <div
          className={`text-xs ${
            status.kind === "success" ? "text-emerald-300" : "text-red-300"
          }`}
        >
          {status.text}
        </div>
      )}
    </div>
  );
}

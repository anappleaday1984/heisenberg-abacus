"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EntranceGate } from "@/components/EntranceGate";
import { LoginButton } from "@/components/LoginButton";
import { PersonaEditor } from "@/components/PersonaEditor";
import { PersonaGenerator } from "@/components/PersonaGenerator";
import { PersonaSummaryTable } from "@/components/PersonaSummaryTable";
import type { Persona } from "@/lib/agents/personas-data";

const HACKMD_URL =
  "https://hackmd.io/oks6Y7BTSJWw3_GvISZujg?both#%E4%BA%BA%E8%A8%AD%E8%A8%AD%E5%AE%9A";

const EMPTY_PERSONA: Omit<Persona, "id"> = {
  archetype: "新類型",
  name: "新受訪者",
  gender: "男",
  age: 30,
  yearlyIncomeTWD: 500_000,
  incomeBreakdown: "請填寫",
  personality: "",
  family: "",
  assetsAndEvents: "",
};

export default function AdminPage() {
  return (
    <EntranceGate>
      <AdminContent />
    </EntranceGate>
  );
}

function AdminContent() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(true);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      const r = await fetch("/api/personas");
      const d: Persona[] = await r.json();
      setPersonas(d);
    } catch (e) {
      setStatus(`載入失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function update(id: string, patch: Partial<Persona>) {
    setPersonas((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function remove(id: string) {
    setPersonas((ps) => ps.filter((p) => p.id !== id));
  }

  function jumpToEditor(id: string) {
    // 編輯卡片若被收合，先打開
    if (!showEditor) setShowEditor(true);
    // 等下個 frame 確保 DOM 已 mount，再 scroll + 高亮
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.getElementById(`persona-edit-${id}`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-blue-400");
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-blue-400");
        }, 1500);
      }, 50);
    });
  }

  function add() {
    const newId = `persona_${Date.now().toString(36)}`;
    setPersonas((ps) => [...ps, { ...EMPTY_PERSONA, id: newId }]);
  }

  function duplicate(id: string) {
    setPersonas((ps) => {
      const idx = ps.findIndex((p) => p.id === id);
      if (idx < 0) return ps;
      const original = ps[idx];
      const copy: Persona = {
        ...original,
        id: `${original.id}_copy_${Date.now().toString(36)}`,
        name: `${original.name}（複本）`,
      };
      return [...ps.slice(0, idx + 1), copy, ...ps.slice(idx + 1)];
    });
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/personas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(personas),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save failed");
      setStatus(`✅ 已儲存 ${data.count} 位受訪者 — 對話介面下次發問即套用`);
    } catch (e) {
      setStatus(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function importFromHackmd() {
    if (
      !confirm(
        `將從 HackMD 重新載入受訪者，會覆蓋目前所有受訪者（含未儲存的編輯）。\n\n要繼續嗎？`
      )
    ) {
      return;
    }
    setImporting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/personas/import-hackmd", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "import failed");
      setPersonas(data.personas);
      setStatus(`✅ 從 HackMD 載入 ${data.count} 位受訪者並已儲存`);
    } catch (e) {
      setStatus(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-8 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">人物設定</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            受訪者管理 — 編輯、新增、複製、刪除、從 HackMD 同步、匯出
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LoginButton />
          <Link href="/" className="text-sm text-blue-400 hover:text-blue-300">
            ← 回對話介面
          </Link>
        </div>
      </header>

      {/* 來源資訊 */}
      <div className="mb-4 bg-slate-900/40 border border-slate-800 rounded-lg px-4 py-3 text-xs text-slate-400 flex items-center justify-between gap-4">
        <div>
          <span className="text-slate-500">預設受訪者來源：</span>
          <a
            href={HACKMD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline break-all"
          >
            HackMD 「人設設定」章節
          </a>
        </div>
        <span className="text-slate-500 whitespace-nowrap">
          系統會自動解析 <code>### N. 類型：別稱</code> 格式，可任意擴充受訪者數量
        </span>
      </div>

      {/* Sticky action bar */}
      <div className="flex flex-wrap gap-3 mb-6 sticky top-2 z-10 bg-slate-950/85 backdrop-blur p-3 rounded-xl border border-slate-800">
        <button
          onClick={save}
          disabled={saving || loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          {saving ? "儲存中..." : "💾 儲存變更"}
        </button>
        <button
          onClick={add}
          disabled={loading}
          className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          ＋ 新增受訪者
        </button>
        <button
          onClick={importFromHackmd}
          disabled={importing || loading}
          className="bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
          title={HACKMD_URL}
        >
          {importing ? "載入中..." : "🔄 從 HackMD 載入"}
        </button>
        <a
          href="/api/personas/markdown"
          download="personas.md"
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center"
        >
          ⬇ 下載 Markdown
        </a>
        <div className="ml-auto flex items-center gap-3 text-sm text-slate-400">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showEditor}
              onChange={(e) => setShowEditor(e.target.checked)}
              className="accent-blue-500"
            />
            顯示編輯卡片
          </label>
          <span>目前共 {personas.length} 位</span>
        </div>
        {status && (
          <div className="w-full text-sm text-slate-300">{status}</div>
        )}
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-20">載入中...</div>
      ) : (
        <div className="space-y-6">
          {/* AI 生成器 */}
          <PersonaGenerator
            onGenerated={(newPersonas) =>
              setPersonas((ps) => [...ps, ...newPersonas])
            }
          />

          {/* 摘要表 — always shown at top */}
          <PersonaSummaryTable
            personas={personas}
            onEdit={jumpToEditor}
            onDelete={remove}
          />

          {/* 編輯卡片區 */}
          {showEditor && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-300 mt-2">
                受訪者詳細編輯
              </h2>
              {personas.map((p, i) => (
                <PersonaEditor
                  key={p.id}
                  persona={p}
                  index={i}
                  onChange={(patch) => update(p.id, patch)}
                  onDelete={() => remove(p.id)}
                  onDuplicate={() => duplicate(p.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

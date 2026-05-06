"use client";

import type { Persona } from "@/lib/agents/personas-data";

type Props = {
  personas: Persona[];
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
};

export function PersonaSummaryTable({ personas, onEdit, onDelete }: Props) {
  const showActions = !!(onEdit || onDelete);

  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">受訪者摘要列表</h2>
        <span className="text-xs text-slate-400">共 {personas.length} 位</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">類型</th>
              <th className="px-3 py-2 text-left font-medium">別稱</th>
              <th className="px-3 py-2 text-left font-medium">性別/年齡</th>
              <th className="px-3 py-2 text-right font-medium">年收入</th>
              <th className="px-3 py-2 text-left font-medium">家庭簡述</th>
              <th className="px-3 py-2 text-left font-medium">ID</th>
              {showActions && (
                <th className="px-3 py-2 text-right font-medium">操作</th>
              )}
            </tr>
          </thead>
          <tbody>
            {personas.map((p, i) => (
              <tr
                key={p.id}
                className="border-t border-slate-700/50 hover:bg-slate-800/40"
              >
                <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                <td className="px-3 py-2 text-slate-300">{p.archetype}</td>
                <td className="px-3 py-2 text-slate-100 font-medium">
                  {p.name}
                </td>
                <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                  {p.gender} / {p.age}
                </td>
                <td className="px-3 py-2 text-right text-slate-300 tabular-nums">
                  {p.yearlyIncomeTWD.toLocaleString()}
                </td>
                <td
                  className="px-3 py-2 text-slate-400 max-w-[28ch] truncate"
                  title={p.family}
                >
                  {p.family}
                </td>
                <td className="px-3 py-2">
                  <code className="text-xs text-slate-500">{p.id}</code>
                </td>
                {showActions && (
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5 whitespace-nowrap">
                      {onEdit && (
                        <button
                          type="button"
                          onClick={() => onEdit(p.id)}
                          className="text-xs text-blue-300 hover:text-blue-100 border border-blue-500/40 hover:border-blue-400 rounded px-2 py-0.5"
                          title="編輯這位受訪者"
                        >
                          ✎ 編輯
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => onDelete(p.id)}
                          className="text-xs text-red-300 hover:text-red-100 border border-red-500/40 hover:border-red-400 rounded px-2 py-0.5"
                          title="直接刪除（無確認）"
                        >
                          ✕ 刪除
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

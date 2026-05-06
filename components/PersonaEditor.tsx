"use client";

import type { Persona } from "@/lib/agents/personas-data";

type Props = {
  persona: Persona;
  index: number;
  onChange: (patch: Partial<Persona>) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
};

const FIELD_LABEL = "block text-xs font-medium text-slate-400 mb-1";
const INPUT =
  "w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500";
const TEXTAREA = `${INPUT} resize-y min-h-[60px] leading-relaxed`;

export function PersonaEditor({
  persona,
  index,
  onChange,
  onDelete,
  onDuplicate,
}: Props) {
  return (
    <div
      id={`persona-edit-${persona.id}`}
      className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 space-y-4 scroll-mt-32"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">受訪者 #{index + 1}</div>
          <h3 className="text-lg font-semibold text-slate-100">
            {persona.archetype}：{persona.name}
          </h3>
          <code className="text-xs text-slate-500">{persona.id}</code>
        </div>
        <div className="flex gap-2">
          {onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              className="text-xs text-slate-300 hover:text-slate-100 border border-slate-600 hover:border-slate-400 rounded px-2 py-1"
            >
              複製
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/60 rounded px-2 py-1"
          >
            刪除
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3">
          <label className={FIELD_LABEL}>ID</label>
          <input
            className={INPUT}
            value={persona.id}
            onChange={(e) => onChange({ id: e.target.value })}
          />
        </div>
        <div className="col-span-3">
          <label className={FIELD_LABEL}>類型 archetype</label>
          <input
            className={INPUT}
            value={persona.archetype}
            onChange={(e) => onChange({ archetype: e.target.value })}
          />
        </div>
        <div className="col-span-3">
          <label className={FIELD_LABEL}>別稱 name</label>
          <input
            className={INPUT}
            value={persona.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className="col-span-1">
          <label className={FIELD_LABEL}>性別</label>
          <select
            className={INPUT}
            value={persona.gender}
            onChange={(e) =>
              onChange({ gender: e.target.value as "男" | "女" })
            }
          >
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className={FIELD_LABEL}>年齡</label>
          <input
            type="number"
            className={INPUT}
            value={persona.age}
            onChange={(e) => onChange({ age: Number(e.target.value) })}
          />
        </div>

        <div className="col-span-4">
          <label className={FIELD_LABEL}>年收入 (TWD)</label>
          <input
            type="number"
            className={INPUT}
            value={persona.yearlyIncomeTWD}
            onChange={(e) =>
              onChange({ yearlyIncomeTWD: Number(e.target.value) })
            }
          />
        </div>
        <div className="col-span-8">
          <label className={FIELD_LABEL}>收入結構說明</label>
          <input
            className={INPUT}
            value={persona.incomeBreakdown}
            onChange={(e) => onChange({ incomeBreakdown: e.target.value })}
          />
        </div>

        <div className="col-span-12">
          <label className={FIELD_LABEL}>人格特質</label>
          <textarea
            className={TEXTAREA}
            value={persona.personality}
            onChange={(e) => onChange({ personality: e.target.value })}
          />
        </div>
        <div className="col-span-12">
          <label className={FIELD_LABEL}>家庭狀況</label>
          <textarea
            className={TEXTAREA}
            value={persona.family}
            onChange={(e) => onChange({ family: e.target.value })}
          />
        </div>
        <div className="col-span-12">
          <label className={FIELD_LABEL}>資產與變故</label>
          <textarea
            className={TEXTAREA}
            value={persona.assetsAndEvents}
            onChange={(e) => onChange({ assetsAndEvents: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { resolveOpenSliderConfig, SLIDER_CONFIGS } from "@/lib/abacus-config";
import { useProductParams } from "@/lib/product-params-context";
import { ShockSliders } from "./ShockSliders";

export function AbacusBar() {
  const { type, paramValue, isOpen, openContext, setParamValue } =
    useProductParams();
  const config = isOpen
    ? resolveOpenSliderConfig(openContext)
    : SLIDER_CONFIGS[type];

  return (
    <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-4 backdrop-blur">
      {/* 雙欄佈局 — 左:主算盤珠(利率/月費/回饋率),右:三條外部衝擊。
          所有面板都讀同一份 shocks,移動任何一條三維臨界點都會跟著變。 */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4 lg:gap-6 items-start">
        {/* === 左:主算盤珠 === */}
        <div>
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs uppercase tracking-wider text-violet-300 font-bold">
                🧮 算盤珠 · {config.icon} {config.label}
              </span>
              <span className="text-[11px] text-slate-400">{config.desc}</span>
            </div>

            <div className="ml-auto flex items-baseline gap-1 tabular-nums">
              <span className="text-2xl font-bold text-blue-300">
                {config.step < 1
                  ? paramValue.toFixed(2)
                  : paramValue.toLocaleString()}
              </span>
              <span className="text-sm text-slate-300">{config.unit}</span>
            </div>
          </div>

          <input
            type="range"
            min={config.min}
            max={config.max}
            step={config.step}
            value={paramValue}
            onChange={(e) => setParamValue(Number(e.target.value))}
            className="w-full accent-violet-500"
          />

          <div className="flex justify-between text-[10px] text-slate-500 mt-0.5 tabular-nums">
            <span>
              {config.min}
              {config.unit}
            </span>
            <span>
              {config.max}
              {config.unit}
            </span>
          </div>

          <div className="flex gap-2 mt-2 flex-wrap">
            {config.presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setParamValue(preset)}
                className={`text-[10px] px-2 py-0.5 rounded border ${
                  Math.abs(paramValue - preset) < config.step
                    ? "bg-violet-500/30 border-violet-400 text-violet-200"
                    : "bg-slate-700 border-slate-600 text-slate-400 hover:text-slate-200"
                }`}
              >
                {preset}
                {config.unit}
              </button>
            ))}
          </div>
        </div>

        {/* === 右:三條外部衝擊滑桿 === */}
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs uppercase tracking-wider text-amber-300 font-bold">
              ⚠ 外部衝擊
            </span>
            <span className="text-[11px] text-slate-400">
              通膨×失業 — 全區面板的臨界點同步偏移
            </span>
          </div>
          <ShockSliders compact />
        </div>
      </div>
    </div>
  );
}

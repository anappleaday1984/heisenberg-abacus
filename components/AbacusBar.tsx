"use client";

import { SLIDER_CONFIGS } from "@/lib/abacus-config";
import { useProductParams } from "@/lib/product-params-context";

export function AbacusBar() {
  const { type, paramValue, setParamValue } = useProductParams();
  const config = SLIDER_CONFIGS[type];

  return (
    <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-4 backdrop-blur">
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
  );
}

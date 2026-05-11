"use client";

import type { ShockState } from "@/lib/persona-projections";
import { useProductParams } from "@/lib/product-params-context";

type Color = "amber" | "rose";

const COLOR_CLS: Record<Color, string> = {
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-300 accent-amber-500",
  rose: "border-rose-500/40 bg-rose-500/10 text-rose-300 accent-rose-500",
};

type Props = {
  /** compact: 緊湊版,給 bottom bar 用,標題小、不顯示說明文字 */
  compact?: boolean;
};

/**
 * 兩條外部衝擊滑桿(通膨 / 失業)。讀寫共用 ProductParamsContext.shocks,
 * 任何頁面引入它都會跟所有面板的「臨界點」即時連動。
 */
export function ShockSliders({ compact = false }: Props) {
  const { shocks, setShocks } = useProductParams();
  return (
    <div className={`grid grid-cols-2 gap-${compact ? 2 : 3}`}>
      <ShockSlider
        label="通膨率"
        icon="📈"
        value={shocks.inflation}
        min={0}
        max={10}
        step={0.5}
        unit="%"
        color="amber"
        compact={compact}
        onChange={(v) => setShocks((s) => ({ ...s, inflation: v }))}
      />
      <ShockSlider
        label="失業率"
        icon="📉"
        value={shocks.unemployment}
        min={2}
        max={15}
        step={0.5}
        unit="%"
        color="rose"
        compact={compact}
        onChange={(v) => setShocks((s) => ({ ...s, unemployment: v }))}
      />
    </div>
  );
}

function ShockSlider({
  label,
  icon,
  value,
  min,
  max,
  step,
  unit,
  color,
  compact,
  onChange,
}: {
  label: string;
  icon: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  color: Color;
  compact: boolean;
  onChange: (v: number) => void;
}) {
  const cls = COLOR_CLS[color];
  return (
    <div className={`border rounded-lg ${compact ? "px-2.5 py-1.5" : "px-3 py-2"} ${cls}`}>
      <div className="flex items-baseline justify-between gap-1">
        <span
          className={`${compact ? "text-[10px]" : "text-[10px]"} uppercase tracking-wider font-bold whitespace-nowrap`}
        >
          {icon} {label}
        </span>
        <span
          className={`${compact ? "text-sm" : "text-base"} font-bold tabular-nums`}
        >
          {value.toFixed(step < 1 ? 1 : 0)}
          <span className="text-[10px] ml-0.5">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full ${compact ? "mt-0.5" : "mt-1"} ${cls.split(" ").pop()}`}
      />
    </div>
  );
}

/** 給沒有 ProductParamsContext 的場景(rare)用的 stub —— 保留一個 type re-export 方便外部 import */
export type { ShockState };

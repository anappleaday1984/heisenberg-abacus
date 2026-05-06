"use client";

import { useEffect, useMemo, useState } from "react";
import type { Persona } from "@/lib/agents/personas-data";
import {
  colorForPersona,
  computePurchaseIntent,
  computeRadarScores,
  detectProductType,
  type ProductType,
} from "@/lib/persona-scores";
import { useProductParams } from "@/lib/product-params-context";

type Props = {
  personas: Persona[];
  /** 使用者問題 + PM 計畫 — 用來推斷產品類型 */
  productContext?: string;
};

const PADDING = { top: 18, right: 24, bottom: 38, left: 44 };

type SliderConfig = {
  type: ProductType;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
  presets: number[];
  icon: string;
  desc: string;
};

const SLIDER_CONFIGS: Record<ProductType, SliderConfig> = {
  loan: {
    type: "loan",
    label: "年利率",
    unit: "%",
    min: 0,
    max: 20,
    step: 0.01,
    default: 6.88,
    presets: [0.88, 6.88, 12.88, 18],
    icon: "💰",
    desc: "信貸 · 利率往上 → 客群放棄",
  },
  insurance: {
    type: "insurance",
    label: "月費",
    unit: "元/月",
    min: 0,
    max: 1000,
    step: 10,
    default: 199,
    presets: [99, 199, 399, 699],
    icon: "🛡",
    desc: "保險 · 保費調漲 → 弱勢族群退場",
  },
  creditcard: {
    type: "creditcard",
    label: "主要回饋率",
    unit: "%",
    min: 0,
    max: 10,
    step: 0.1,
    default: 5,
    presets: [1, 3, 5, 8],
    icon: "💳",
    desc: "信用卡 · 回饋拉高 → 觸發辦卡意願",
  },
};

export function PhaseTransitionMap({ personas, productContext }: Props) {
  const { type: productType, paramValue, setType, setParamValue, buildParams } =
    useProductParams();

  const detected = useMemo(
    () => detectProductType(productContext ?? ""),
    [productContext]
  );

  // 第一次掛載 + productContext 改變時，把 context 切到偵測到的類型
  useEffect(() => {
    setType(detected);
  }, [detected, setType]);

  const config = SLIDER_CONFIGS[productType];
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // 計算每個點 (x = 經濟壓力, y = 購買意願)
  const points = useMemo(() => {
    const params = buildParams();
    return personas.map((p, i) => {
      const scores = computeRadarScores(p);
      return {
        persona: p,
        x: scores.economicPressure,
        y: computePurchaseIntent(scores, params),
        color: colorForPersona(p.id, i),
        idx: i,
      };
    });
  }, [personas, productType, paramValue, buildParams]);

  const willBuy = points.filter((p) => p.y >= 60).length;
  const watching = points.filter((p) => p.y >= 40 && p.y < 60).length;
  const reject = points.filter((p) => p.y < 40).length;
  const total = points.length;

  // SVG
  const W = 560;
  const H = 380;
  const innerW = W - PADDING.left - PADDING.right;
  const innerH = H - PADDING.top - PADDING.bottom;
  const xScale = (x: number) => PADDING.left + (x / 100) * innerW;
  const yScale = (y: number) =>
    PADDING.top + innerH - (y / 100) * innerH;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-5 max-w-3xl mx-auto">
      {/* === Header === */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-violet-400 font-bold">
            行為相變散佈圖 · Behavioral Phase Transition Map
          </div>
          <h3 className="text-base font-bold text-slate-100 leading-tight mt-0.5">
            {personas.length} 位受訪者的「{config.label}臨界點」
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{config.desc}</p>
        </div>
        <span className="text-[10px] text-slate-500 whitespace-nowrap">
          ⌬ 不確定性可視化
        </span>
      </div>

      {/* === 產品類型 segmented control === */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
          產品類型
        </span>
        <div className="inline-flex bg-slate-800/60 border border-slate-700 rounded-lg p-0.5">
          {(Object.keys(SLIDER_CONFIGS) as ProductType[]).map((t) => {
            const c = SLIDER_CONFIGS[t];
            const active = t === productType;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`px-3 py-1 rounded-md text-[11px] font-medium transition ${
                  active
                    ? "bg-violet-500/30 text-violet-100 border border-violet-400/50"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {c.icon} {c.label.replace("年", "").replace("月費", "保險")}
              </button>
            );
          })}
        </div>
        {detected === productType && (
          <span className="text-[10px] text-emerald-400" title="從問題中自動辨識">
            ✓ 自動辨識
          </span>
        )}
      </div>

      {/* === Stats row === */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat color="emerald" label="會購買" value={willBuy} total={total} />
        <Stat color="amber" label="觀望中" value={watching} total={total} />
        <Stat color="rose" label="放棄" value={reject} total={total} />
      </div>

      {/* === SVG Scatter === */}
      <div className="bg-slate-950/40 rounded-xl border border-slate-800 p-2 mb-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          {/* 三色臨界帶 */}
          <rect x={PADDING.left} y={yScale(100)} width={innerW} height={yScale(60) - yScale(100)} fill="#10b98120" />
          <rect x={PADDING.left} y={yScale(60)} width={innerW} height={yScale(40) - yScale(60)} fill="#fbbf2415" />
          <rect x={PADDING.left} y={yScale(40)} width={innerW} height={yScale(0) - yScale(40)} fill="#fb718515" />

          {/* 臨界線 */}
          <line x1={PADDING.left} x2={W - PADDING.right} y1={yScale(60)} y2={yScale(60)} stroke="#34d39990" strokeDasharray="3 3" strokeWidth={0.8} />
          <line x1={PADDING.left} x2={W - PADDING.right} y1={yScale(40)} y2={yScale(40)} stroke="#fb718590" strokeDasharray="3 3" strokeWidth={0.8} />

          {/* 軸線 */}
          <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={H - PADDING.bottom} stroke="#475569" strokeWidth={0.8} />
          <line x1={PADDING.left} y1={H - PADDING.bottom} x2={W - PADDING.right} y2={H - PADDING.bottom} stroke="#475569" strokeWidth={0.8} />

          {/* X 刻度 */}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={`xt-${v}`}>
              <line x1={xScale(v)} x2={xScale(v)} y1={H - PADDING.bottom} y2={H - PADDING.bottom + 4} stroke="#475569" strokeWidth={0.6} />
              <text x={xScale(v)} y={H - PADDING.bottom + 16} fontSize={9} fill="#64748b" textAnchor="middle">{v}</text>
            </g>
          ))}
          {/* Y 刻度 */}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={`yt-${v}`}>
              <line x1={PADDING.left - 4} x2={PADDING.left} y1={yScale(v)} y2={yScale(v)} stroke="#475569" strokeWidth={0.6} />
              <text x={PADDING.left - 8} y={yScale(v) + 3} fontSize={9} fill="#64748b" textAnchor="end">{v}</text>
            </g>
          ))}

          <text x={PADDING.left + innerW / 2} y={H - 4} fontSize={11} fontWeight={600} fill="#cbd5e1" textAnchor="middle">經濟壓力值 →</text>
          <text x={-(PADDING.top + innerH / 2)} y={12} fontSize={11} fontWeight={600} fill="#cbd5e1" textAnchor="middle" transform="rotate(-90)">購買意願度 →</text>

          <text x={W - PADDING.right - 4} y={yScale(82)} fontSize={9} fill="#34d39990" textAnchor="end" fontWeight={700}>購買區</text>
          <text x={W - PADDING.right - 4} y={yScale(50)} fontSize={9} fill="#fbbf2490" textAnchor="end" fontWeight={700}>觀望區</text>
          <text x={W - PADDING.right - 4} y={yScale(20)} fontSize={9} fill="#fb718590" textAnchor="end" fontWeight={700}>放棄區</text>

          {/* 散點 */}
          {points.map((pt) => {
            const isHover = hoverIdx === pt.idx;
            return (
              <circle
                key={pt.persona.id}
                cx={xScale(pt.x)}
                cy={yScale(pt.y)}
                r={isHover ? 7 : 5}
                fill={pt.color}
                fillOpacity={isHover ? 0.95 : 0.75}
                stroke="#0b1020"
                strokeWidth={1}
                style={{
                  transition: "cx 700ms cubic-bezier(0.34, 1.56, 0.64, 1), cy 700ms cubic-bezier(0.34, 1.56, 0.64, 1), r 150ms ease",
                  cursor: "pointer",
                }}
                onMouseEnter={() => setHoverIdx(pt.idx)}
                onMouseLeave={() => setHoverIdx(null)}
              />
            );
          })}

          {hoverIdx !== null && (
            <g style={{ pointerEvents: "none" }} transform={`translate(${xScale(points[hoverIdx].x) + 10}, ${yScale(points[hoverIdx].y) - 10})`}>
              <rect x={0} y={-30} width={170} height={36} rx={4} fill="#0f172a" stroke="#475569" />
              <text x={6} y={-16} fontSize={10} fill="#cbd5e1">{points[hoverIdx].persona.archetype}：{points[hoverIdx].persona.name}</text>
              <text x={6} y={-2} fontSize={9} fill="#94a3b8">壓力 {points[hoverIdx].x} · 意願 {points[hoverIdx].y}</text>
            </g>
          )}
        </svg>
      </div>

      {/* === 算盤滑桿（依產品類型動態 label） === */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] uppercase tracking-wider text-violet-300 font-bold">
            🧮 算盤珠 · {config.label}
          </label>
          <span className="text-2xl font-bold text-blue-300 tabular-nums">
            {config.step < 1
              ? paramValue.toFixed(2)
              : paramValue.toLocaleString()}
            <span className="text-sm ml-0.5">{config.unit}</span>
          </span>
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
    </div>
  );
}

function Stat({
  color,
  label,
  value,
  total,
}: {
  color: "emerald" | "amber" | "rose";
  label: string;
  value: number;
  total: number;
}) {
  const cls: Record<typeof color, string> = {
    emerald: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    amber: "bg-amber-500/15 border-amber-500/40 text-amber-300",
    rose: "bg-rose-500/15 border-rose-500/40 text-rose-300",
  };
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={`border rounded-lg p-2 text-center ${cls[color]}`}>
      <div className="text-[10px] opacity-80">{label}</div>
      <div className="text-xl font-bold tabular-nums leading-none mt-0.5">
        {value}
        <span className="text-xs ml-0.5 opacity-80">位</span>
      </div>
      <div className="text-[9px] opacity-70 tabular-nums mt-0.5">{pct}%</div>
    </div>
  );
}

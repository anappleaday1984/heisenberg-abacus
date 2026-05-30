"use client";

import { useMemo, useState } from "react";
import type { QAEntry } from "@/lib/agents/types";
import {
  buildThreeLayerFlows,
  DECISION_BUCKETS,
  decisionFromIntent,
  type DecisionKey,
  type FlowSegment,
} from "@/lib/persona-flows";
import { resolveOpenSliderConfig, SLIDER_CONFIGS } from "@/lib/abacus-config";
import {
  computeOpenIntent,
  computePurchaseIntent,
  computeRadarScores,
  productLabel,
} from "@/lib/persona-scores";
import { applyShocks } from "@/lib/persona-projections";
import { useProductParams } from "@/lib/product-params-context";

type Props = {
  entries: QAEntry[];
};

const W = 760;
const H = 480;
const PAD = { top: 56, bottom: 36, left: 16, right: 16 };
const NODE_W = 18;
const GAP = 8;
const KEYWORD_X = 156;
const INCENTIVE_X = 380;
const DECISION_X = 600;

// 第一層:每個 keyword bucket 獨立色,讓使用者一眼分得清不同主題的人有多少。
// 避開右側 decision 三色(emerald / amber / rose)避免視覺混淆。
const KEYWORD_COLORS: Record<string, string> = {
  "🛵 機車與工作": "#fb923c", // orange-400
  "👨‍👩‍👧 家庭與責任": "#2dd4bf", // teal-400
  "💸 信用與債務": "#ef4444", // red-500
  "📈 投資與儲蓄": "#eab308", // yellow-500
  "🏥 健康與意外": "#84cc16", // lime-500
  "💰 價格與負擔": "#ec4899", // pink-500
  "🤝 信任與條款": "#6366f1", // indigo-500
  "⚡ 便利與速度": "#06b6d4", // cyan-500
  "🔹 其他主題": "#64748b", // slate-500
};
const KEYWORD_FALLBACK_COLOR = "#64748b";

// 第二層:每個 incentive bucket 獨立色。
// 跟第一層拉開色相(藍 / 綠 / 紫等),避免跟左側某些 keyword 撞色到看起來相連。
const INCENTIVE_COLORS: Record<string, string> = {
  "💰 剛性支出節流": "#f97316", // orange-500
  "🛡 安全感建構": "#3b82f6", // blue-500
  "📈 機會型成長": "#16a34a", // green-600
  "⚡ 便利速度": "#a855f7", // purple-500
  "🚧 風險規避": "#db2777", // pink-600
  "🔸 一般考量": "#64748b", // slate-500
};
const INCENTIVE_FALLBACK_COLOR = "#64748b";

// 標題列用的代表色 — 給三欄頂部標籤使用
const KEYWORD_HEADER_COLOR = "#7dd3fc"; // sky-300 中性偏冷,代表脈絡
const INCENTIVE_HEADER_COLOR = "#c084fc"; // purple-400 代表動機

// 流動層(ribbon)使用 SVG linearGradient,從 source 節點顏色漸變到 target 節點顏色。
// 透過 fillOpacity 0.55 讓整體呈現「淺色」感,同時保留兩端的顏色辨識度 — 看到 ribbon
// 起點是橙色就知道來自「機車與工作」keyword,看到尾端是 emerald 就知道流向「願意」決策。

const colorForKeyword = (k: string) => KEYWORD_COLORS[k] ?? KEYWORD_FALLBACK_COLOR;
const colorForIncentive = (k: string) =>
  INCENTIVE_COLORS[k] ?? INCENTIVE_FALLBACK_COLOR;

type HoverKey = {
  layer: "k2i" | "i2d";
  from: string;
  to: string;
};

export function DecisionSankey({ entries }: Props) {
  const [hover, setHover] = useState<HoverKey | null>(null);
  const { type, paramValue, isOpen, openContext, shocks, buildParams } =
    useProductParams();

  // 開放式問題（不是信貸／保險／信用卡，例如氣泡飲定價）改用「情境壓力」意願公式，
  // 與行為相變散佈圖一致。否則沿用 buildParams() 返回的金融產品參數會把開放式滑桿值
  // （如飲料定價 60 元）誤當成利率 60% 餵進信貸公式，導致全員意願飽和到 0、桑基圖
  // 不隨算盤珠變動。這裡把算盤珠值正規化為 0-100 的外在壓力 stress。
  const config = isOpen
    ? resolveOpenSliderConfig(openContext)
    : SLIDER_CONFIGS[type];

  const data = useMemo(() => {
    const params = buildParams();
    const range = config.max - config.min || 1;
    const stress = ((paramValue - config.min) / range) * 100;
    return buildThreeLayerFlows(entries, (entry) => {
      const scores = computeRadarScores(entry.persona);
      const baseIntent = isOpen
        ? computeOpenIntent(scores, stress)
        : computePurchaseIntent(scores, params);
      const intent = applyShocks(baseIntent, scores, shocks);
      return decisionFromIntent(intent);
    });
  }, [
    entries,
    type,
    paramValue,
    isOpen,
    config.min,
    config.max,
    shocks,
    buildParams,
  ]);

  const {
    keywordToIncentive,
    incentiveToDecision,
    keywordTotals,
    incentiveTotals,
    decisionTotals,
  } = data;

  // ---- 列出每層用到的 bucket(過濾 0 人桶) ----
  const keywordList = Object.keys(keywordTotals).filter(
    (k) => keywordTotals[k] > 0
  );
  const incentiveList = Object.keys(incentiveTotals).filter(
    (k) => incentiveTotals[k] > 0
  );
  const decisionList: DecisionKey[] = ["願意", "觀望", "拒絕"].filter(
    (d) => decisionTotals[d as DecisionKey] > 0
  ) as DecisionKey[];

  const total = entries.length;
  const innerH = H - PAD.top - PAD.bottom;

  // ---- 各層節點高度與 y ----
  const layoutNodes = (
    list: string[],
    totals: Record<string, number>
  ) => {
    const sum = list.reduce((s, k) => s + (totals[k] ?? 0), 0);
    const usable = innerH - GAP * Math.max(0, list.length - 1);
    let y = PAD.top;
    return list.map((k) => {
      const count = totals[k] ?? 0;
      const h = Math.max(14, (usable * count) / Math.max(1, sum));
      const node = { key: k, y, h, count };
      y += h + GAP;
      return node;
    });
  };
  const keywordNodes = layoutNodes(keywordList, keywordTotals);
  const incentiveNodes = layoutNodes(incentiveList, incentiveTotals);
  const decisionNodes = layoutNodes(
    decisionList,
    decisionTotals as Record<string, number>
  );

  // ---- ribbon 幾何:每段 segment 在 source / target 內依排序累積偏移 ----
  // fromColor / toColor 給 SVG linearGradient 用,讓 ribbon 從出發層顏色逐漸轉到目的層顏色。
  type Geom = {
    seg: FlowSegment;
    path: string;
    fromColor: string;
    toColor: string;
    layer: "k2i" | "i2d";
    gradId: string;
  };

  function buildSegments(
    segments: FlowSegment[],
    sourceList: string[],
    targetList: string[],
    sourceNodes: ReturnType<typeof layoutNodes>,
    targetNodes: ReturnType<typeof layoutNodes>,
    x1: number,
    x2: number,
    colorOf: { from: (k: string) => string; to: (k: string) => string },
    layer: "k2i" | "i2d"
  ): Geom[] {
    // 依 source 排序順序 → target 排序順序排序,確保堆疊一致
    const sorted = [...segments].sort((a, b) => {
      const aSrc = sourceList.indexOf(a.from);
      const bSrc = sourceList.indexOf(b.from);
      if (aSrc !== bSrc) return aSrc - bSrc;
      return targetList.indexOf(a.to) - targetList.indexOf(b.to);
    });
    const sourceOffset: Record<string, number> = {};
    const targetOffset: Record<string, number> = {};
    const result: Geom[] = [];
    for (const seg of sorted) {
      const src = sourceNodes.find((n) => n.key === seg.from);
      const tgt = targetNodes.find((n) => n.key === seg.to);
      if (!src || !tgt) continue;
      const srcRatio = seg.count / Math.max(1, src.count);
      const tgtRatio = seg.count / Math.max(1, tgt.count);
      const flowH1 = Math.max(1.2, src.h * srcRatio);
      const flowH2 = Math.max(1.2, tgt.h * tgtRatio);
      const yFrom = src.y + (sourceOffset[seg.from] ?? 0);
      sourceOffset[seg.from] = (sourceOffset[seg.from] ?? 0) + flowH1;
      const yTo = tgt.y + (targetOffset[seg.to] ?? 0);
      targetOffset[seg.to] = (targetOffset[seg.to] ?? 0) + flowH2;

      const cxA = x1 + (x2 - x1) * 0.5;
      const cxB = x1 + (x2 - x1) * 0.5;
      const path = [
        `M ${x1} ${yFrom}`,
        `C ${cxA} ${yFrom}, ${cxB} ${yTo}, ${x2} ${yTo}`,
        `L ${x2} ${yTo + flowH2}`,
        `C ${cxB} ${yTo + flowH2}, ${cxA} ${yFrom + flowH1}, ${x1} ${yFrom + flowH1}`,
        `Z`,
      ].join(" ");
      const fromColor = colorOf.from(seg.from);
      const toColor = colorOf.to(seg.to);
      // ID 用 layer + index + 來源/目的 hash 拼成,避免不同 ribbon 共用 gradient
      const gradId = `sankey-grad-${layer}-${result.length}`;
      result.push({ seg, path, fromColor, toColor, layer, gradId });
    }
    return result;
  }

  // k2i:從 keyword 顏色漸變到 incentive 顏色
  const k2iGeoms = buildSegments(
    keywordToIncentive,
    keywordList,
    incentiveList,
    keywordNodes,
    incentiveNodes,
    KEYWORD_X + NODE_W,
    INCENTIVE_X,
    { from: colorForKeyword, to: colorForIncentive },
    "k2i"
  );
  // i2d:從 incentive 顏色漸變到 decision 顏色
  const i2dGeoms = buildSegments(
    incentiveToDecision,
    incentiveList,
    decisionList,
    incentiveNodes,
    decisionNodes,
    INCENTIVE_X + NODE_W,
    DECISION_X,
    {
      from: colorForIncentive,
      to: (d) => DECISION_BUCKETS[d as DecisionKey].color,
    },
    "i2d"
  );

  const allGeoms: Geom[] = [...k2iGeoms, ...i2dGeoms];

  // hover 時對應的 segment 詳細(列出 personas)
  const hoverSeg = hover
    ? (hover.layer === "k2i" ? keywordToIncentive : incentiveToDecision).find(
        (s) => s.from === hover.from && s.to === hover.to
      )
    : null;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-5 max-w-5xl mx-auto">
      {/* === Header === */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold">
            決策路徑桑基圖 · Decision Path Sankey (3-layer)
          </div>
          <h3 className="text-base font-bold text-slate-100 leading-tight mt-0.5">
            語意脈絡 → 行為誘因 → 決策結果
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            中間層揭示「為什麼願意 / 為什麼拒絕」— 同樣是願意,有人為了省錢、有人為了便利
          </p>
        </div>
        <div className="text-[10px] text-slate-500 whitespace-nowrap text-right">
          <div>
            {total} 位 · {keywordToIncentive.length + incentiveToDecision.length} 段路徑
          </div>
          <div className="text-violet-400 font-semibold tabular-nums">
            🧮 {config.icon}{" "}
            {config.step < 1
              ? paramValue.toFixed(2)
              : paramValue.toLocaleString()}
            {config.unit}
          </div>
        </div>
      </div>

      {/* === SVG Sankey === */}
      <div className="bg-slate-950/40 rounded-xl border border-slate-800 p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* 三層欄頂標題 */}
          <text
            x={KEYWORD_X + NODE_W / 2}
            y={PAD.top - 26}
            fontSize={13}
            fontWeight={700}
            fill="#94a3b8"
            textAnchor="middle"
          >
            ◉ 語意脈絡
          </text>
          <text
            x={KEYWORD_X + NODE_W / 2}
            y={PAD.top - 10}
            fontSize={10}
            fill="#64748b"
            textAnchor="middle"
          >
            (答案命中關鍵字)
          </text>
          <text
            x={INCENTIVE_X + NODE_W / 2}
            y={PAD.top - 26}
            fontSize={13}
            fontWeight={700}
            fill={INCENTIVE_HEADER_COLOR}
            textAnchor="middle"
          >
            ✦ 行為誘因
          </text>
          <text
            x={INCENTIVE_X + NODE_W / 2}
            y={PAD.top - 10}
            fontSize={10}
            fill="#64748b"
            textAnchor="middle"
          >
            (省錢 / 安全感 / 便利 / 機會 / 規避)
          </text>
          <text
            x={DECISION_X + NODE_W / 2}
            y={PAD.top - 26}
            fontSize={13}
            fontWeight={700}
            fill="#94a3b8"
            textAnchor="middle"
          >
            最終決策 ◉
          </text>
          <text
            x={DECISION_X + NODE_W / 2}
            y={PAD.top - 10}
            fontSize={10}
            fill="#64748b"
            textAnchor="middle"
          >
            (願意 / 觀望 / 拒絕)
          </text>

          {/* 漸變色定義 — 每條 ribbon 獨立 linearGradient,從 source 色漸變到 target 色 */}
          <defs>
            {allGeoms.map((g) => (
              <linearGradient
                key={g.gradId}
                id={g.gradId}
                gradientUnits="userSpaceOnUse"
                x1={g.layer === "k2i" ? KEYWORD_X + NODE_W : INCENTIVE_X + NODE_W}
                y1={0}
                x2={g.layer === "k2i" ? INCENTIVE_X : DECISION_X}
                y2={0}
              >
                <stop offset="0%" stopColor={g.fromColor} />
                <stop offset="100%" stopColor={g.toColor} />
              </linearGradient>
            ))}
          </defs>

          {/* === Ribbons (兩層,漸變色) === */}
          {allGeoms.map((g, i) => {
            const isHover =
              hover?.layer === g.layer &&
              hover?.from === g.seg.from &&
              hover?.to === g.seg.to;
            const dimmed = hover && !isHover;
            return (
              <path
                key={`${g.layer}-${i}`}
                d={g.path}
                fill={`url(#${g.gradId})`}
                // 全節點色 stops + 0.55 opacity = 視覺上類似淺色,且兩端顏色明顯,
                // 中間自然漸變到目的色。Hover 時 dimmed 大幅降低形成對比。
                fillOpacity={dimmed ? 0.08 : 0.55}
                stroke={g.toColor}
                strokeOpacity={dimmed ? 0.1 : 0.5}
                strokeWidth={0.5}
                style={{ cursor: "pointer", transition: "fill-opacity 200ms" }}
                onMouseEnter={() =>
                  setHover({ layer: g.layer, from: g.seg.from, to: g.seg.to })
                }
                onMouseLeave={() => setHover(null)}
              />
            );
          })}

          {/* === Keyword nodes (左) — 每桶用 KEYWORD_COLORS 對應的獨立色 === */}
          {keywordNodes.map((n) => {
            const c = colorForKeyword(n.key);
            return (
              <g key={`kw-${n.key}`}>
                <rect
                  x={KEYWORD_X}
                  y={n.y}
                  width={NODE_W}
                  height={n.h}
                  fill={c}
                  rx={2}
                />
                <text
                  x={KEYWORD_X - 8}
                  y={n.y + n.h / 2 - 1}
                  fontSize={13}
                  fontWeight={700}
                  fill={c}
                  textAnchor="end"
                >
                  {n.key}
                </text>
                <text
                  x={KEYWORD_X - 8}
                  y={n.y + n.h / 2 + 13}
                  fontSize={11}
                  fill="#64748b"
                  textAnchor="end"
                  fontWeight={500}
                >
                  {n.count} 位
                </text>
              </g>
            );
          })}

          {/* === Incentive nodes (中) — 每桶用 INCENTIVE_COLORS 對應的獨立色 === */}
          {incentiveNodes.map((n) => {
            const c = colorForIncentive(n.key);
            return (
              <g key={`inc-${n.key}`}>
                <rect
                  x={INCENTIVE_X}
                  y={n.y}
                  width={NODE_W}
                  height={n.h}
                  fill={c}
                  rx={2}
                />
                {/* 標籤右側 — 高度夠(>= 28)分主標+副標,矮節點壓縮成單行 */}
                {n.h >= 28 ? (
                  <>
                    <text
                      x={INCENTIVE_X + NODE_W + 6}
                      y={n.y + n.h / 2 - 1}
                      fontSize={12}
                      fontWeight={700}
                      fill={c}
                      textAnchor="start"
                    >
                      {n.key}
                    </text>
                    <text
                      x={INCENTIVE_X + NODE_W + 6}
                      y={n.y + n.h / 2 + 13}
                      fontSize={10}
                      fill="#94a3b8"
                      textAnchor="start"
                      fontWeight={500}
                    >
                      {n.count} 位 ({Math.round((n.count / total) * 100)}%)
                    </text>
                  </>
                ) : (
                  <text
                    x={INCENTIVE_X + NODE_W + 6}
                    y={n.y + n.h / 2 + 4}
                    fontSize={11}
                    fontWeight={700}
                    fill={c}
                    textAnchor="start"
                  >
                    {n.key} · {n.count}
                  </text>
                )}
              </g>
            );
          })}

          {/* === Decision nodes (右) === */}
          {decisionNodes.map((n) => {
            const color = DECISION_BUCKETS[n.key as DecisionKey].color;
            return (
              <g key={`dec-${n.key}`}>
                <rect
                  x={DECISION_X}
                  y={n.y}
                  width={NODE_W}
                  height={n.h}
                  fill={color}
                  rx={2}
                />
                <text
                  x={DECISION_X + NODE_W + 8}
                  y={n.y + n.h / 2 - 1}
                  fontSize={15}
                  fontWeight={800}
                  fill="#e2e8f0"
                  textAnchor="start"
                >
                  {n.key}
                </text>
                <text
                  x={DECISION_X + NODE_W + 8}
                  y={n.y + n.h / 2 + 16}
                  fontSize={12}
                  fill="#94a3b8"
                  textAnchor="start"
                  fontWeight={500}
                >
                  {n.count} 位 · {Math.round((n.count / total) * 100)}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* === Hover detail === */}
      {hover && hoverSeg && (
        <div className="mt-3 bg-slate-800/60 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400 mb-1">
            <span className="text-slate-300 font-semibold">{hoverSeg.from}</span>
            {" → "}
            <span
              className="font-semibold"
              style={{
                color:
                  hover.layer === "i2d"
                    ? DECISION_BUCKETS[hoverSeg.to as DecisionKey].color
                    : colorForIncentive(hoverSeg.to),
              }}
            >
              {hoverSeg.to}
            </span>
            <span className="text-slate-500"> · 共 {hoverSeg.count} 位</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {hoverSeg.personas.slice(0, 12).map((p) => (
              <span
                key={p.id}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300"
              >
                {p.archetype}：{p.name}
              </span>
            ))}
            {hoverSeg.personas.length > 12 && (
              <span className="text-[10px] text-slate-500">
                + {hoverSeg.personas.length - 12} 位
              </span>
            )}
          </div>
        </div>
      )}

      <footer className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-500 text-center">
        中間層揭示動機差異 — 同樣「願意」,行銷文案要對「省錢族」打加油回饋,對「便利族」打快速核卡
        ;依{isOpen ? config.label : productLabel(type)}算盤即時更新
      </footer>
    </div>
  );
}

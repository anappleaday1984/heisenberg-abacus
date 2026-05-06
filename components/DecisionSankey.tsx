"use client";

import { useMemo, useState } from "react";
import type { QAEntry } from "@/lib/agents/types";
import {
  buildFlows,
  DECISION_BUCKETS,
  decisionFromIntent,
  type DecisionKey,
  KEYWORD_BUCKETS,
} from "@/lib/persona-flows";
import {
  computePurchaseIntent,
  computeRadarScores,
  productLabel,
} from "@/lib/persona-scores";
import { useProductParams } from "@/lib/product-params-context";

type Props = {
  entries: QAEntry[];
};

const W = 720;
const H = 420;
const PAD = { top: 40, bottom: 30, left: 16, right: 16 };
const NODE_W = 18;
const GAP = 8;
const KEYWORD_X = 140;
const DECISION_X = W - 200;

const KEYWORD_COLOR = "#60a5fa";

export function DecisionSankey({ entries }: Props) {
  const [hover, setHover] = useState<{ from: string; to: DecisionKey } | null>(
    null
  );

  const { type, paramValue, buildParams } = useProductParams();

  // 用 intent-based 決策（與算盤連動）— 滑桿動 → 重新分類
  const { flows, keywordTotals, decisionTotals } = useMemo(() => {
    const params = buildParams();
    return buildFlows(entries, (entry) => {
      const scores = computeRadarScores(entry.persona);
      const intent = computePurchaseIntent(scores, params);
      return decisionFromIntent(intent);
    });
  }, [entries, type, paramValue, buildParams]);

  // 過濾掉沒有命中任何 keyword 的人 — 用 flows 計算的 keyword 桶
  const keywordList = Object.keys(KEYWORD_BUCKETS).filter(
    (k) => (keywordTotals[k] ?? 0) > 0
  );
  const decisionList = Object.keys(DECISION_BUCKETS) as DecisionKey[];

  const innerH = H - PAD.top - PAD.bottom;

  // ---- 排版計算 ----
  // 左側 keyword 節點：依 keyword 總量比例分配高度
  const keywordTotal = keywordList.reduce(
    (sum, k) => sum + (keywordTotals[k] ?? 0),
    0
  );
  const decisionTotal = decisionList.reduce(
    (sum, d) => sum + decisionTotals[d],
    0
  );

  const keywordNodes = (() => {
    let y = PAD.top;
    return keywordList.map((k) => {
      const count = keywordTotals[k] ?? 0;
      const h = Math.max(
        14,
        ((innerH - GAP * (keywordList.length - 1)) * count) /
          Math.max(1, keywordTotal)
      );
      const node = { key: k, y, h, count };
      y += h + GAP;
      return node;
    });
  })();

  const decisionNodes = (() => {
    let y = PAD.top;
    return decisionList.map((d) => {
      const count = decisionTotals[d];
      const h = Math.max(
        14,
        ((innerH - GAP * (decisionList.length - 1)) * count) /
          Math.max(1, decisionTotal)
      );
      const node = { key: d, y, h, count };
      y += h + GAP;
      return node;
    });
  })();

  // 每個 flow 的 source y / target y 位置（依 flow 在該節點裡的累積偏移）
  // 為了正確堆疊：對每個 source/target 節點，按 flow 大小排序、依序堆疊
  const sourceOffsets: Record<string, number> = {};
  const targetOffsets: Record<DecisionKey, number> = {
    願意: 0,
    觀望: 0,
    拒絕: 0,
  };

  // 排序 flows：先依 source 堆疊順序（在 keywordList 的 index）
  const sortedFlows = [...flows].sort((a, b) => {
    const aSrc = keywordList.indexOf(a.from);
    const bSrc = keywordList.indexOf(b.from);
    if (aSrc !== bSrc) return aSrc - bSrc;
    const aTgt = decisionList.indexOf(a.to);
    const bTgt = decisionList.indexOf(b.to);
    return aTgt - bTgt;
  });

  const flowGeoms = sortedFlows.map((f) => {
    const src = keywordNodes.find((n) => n.key === f.from);
    const tgt = decisionNodes.find((n) => n.key === f.to);
    if (!src || !tgt) return null;

    const ratio = f.count / Math.max(1, src.count);
    const flowH = Math.max(1.5, src.h * ratio);
    const yFromStart = src.y + (sourceOffsets[f.from] ?? 0);
    sourceOffsets[f.from] = (sourceOffsets[f.from] ?? 0) + flowH;

    const tgtRatio = f.count / Math.max(1, tgt.count);
    const tgtFlowH = Math.max(1.5, tgt.h * tgtRatio);
    const yToStart = tgt.y + targetOffsets[f.to];
    targetOffsets[f.to] += tgtFlowH;

    const x1 = KEYWORD_X + NODE_W;
    const x2 = DECISION_X;
    const cx1 = x1 + (x2 - x1) * 0.5;
    const cx2 = x1 + (x2 - x1) * 0.5;

    // 畫成「絲帶」— 用 path: 上邊 + 右側 + 下邊（反向） + 左側
    const path = [
      `M ${x1} ${yFromStart}`,
      `C ${cx1} ${yFromStart}, ${cx2} ${yToStart}, ${x2} ${yToStart}`,
      `L ${x2} ${yToStart + tgtFlowH}`,
      `C ${cx2} ${yToStart + tgtFlowH}, ${cx1} ${yFromStart + flowH}, ${x1} ${yFromStart + flowH}`,
      `Z`,
    ].join(" ");

    return {
      flow: f,
      path,
      color: DECISION_BUCKETS[f.to].color,
    };
  });

  const filteredHover = hover
    ? flows.find((f) => f.from === hover.from && f.to === hover.to)
    : null;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-5 max-w-3xl mx-auto">
      {/* === Header === */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold">
            決策路徑桑基圖 · Decision Path Sankey
          </div>
          <h3 className="text-base font-bold text-slate-100 leading-tight mt-0.5">
            從受訪者語意 → 結構化決策動機
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            左側關鍵字 → 右側決策 ; 絲帶寬 = 受訪者人數 ; 依{productLabel(type)}算盤即時更新
          </p>
        </div>
        <div className="text-[10px] text-slate-500 whitespace-nowrap text-right">
          <div>
            {entries.length} 位受訪者 · {flows.length} 條動機路徑
          </div>
          <div className="text-violet-400 font-semibold tabular-nums">
            🧮 {type === "loan" ? `${paramValue.toFixed(2)}%` :
                type === "insurance" ? `${paramValue} 元/月` :
                `${paramValue.toFixed(1)}% 回饋`}
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
          {/* 區段標題 */}
          <text
            x={KEYWORD_X + NODE_W / 2}
            y={PAD.top - 16}
            fontSize={10}
            fontWeight={700}
            fill="#94a3b8"
            textAnchor="middle"
          >
            ◉ 對話者捕捉到的關鍵字
          </text>
          <text
            x={DECISION_X + NODE_W / 2}
            y={PAD.top - 16}
            fontSize={10}
            fontWeight={700}
            fill="#94a3b8"
            textAnchor="middle"
          >
            最終決策結果 ◉
          </text>

          {/* Flow ribbons */}
          {flowGeoms.map((g, i) => {
            if (!g) return null;
            const isHover = hover?.from === g.flow.from && hover?.to === g.flow.to;
            const dimmed = hover && !isHover;
            return (
              <path
                key={i}
                d={g.path}
                fill={g.color}
                fillOpacity={dimmed ? 0.08 : 0.45}
                stroke={g.color}
                strokeOpacity={dimmed ? 0.1 : 0.6}
                strokeWidth={0.5}
                style={{
                  cursor: "pointer",
                  transition: "fill-opacity 200ms",
                }}
                onMouseEnter={() => setHover({ from: g.flow.from, to: g.flow.to })}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}

          {/* Keyword nodes */}
          {keywordNodes.map((n) => (
            <g key={n.key}>
              <rect
                x={KEYWORD_X}
                y={n.y}
                width={NODE_W}
                height={n.h}
                fill={KEYWORD_COLOR}
                rx={2}
              />
              <text
                x={KEYWORD_X - 6}
                y={n.y + n.h / 2 + 3}
                fontSize={11}
                fontWeight={600}
                fill="#e2e8f0"
                textAnchor="end"
              >
                {n.key}
              </text>
              <text
                x={KEYWORD_X - 6}
                y={n.y + n.h / 2 + 14}
                fontSize={9}
                fill="#64748b"
                textAnchor="end"
                fontWeight={500}
              >
                {n.count} 位
              </text>
            </g>
          ))}

          {/* Decision nodes */}
          {decisionNodes.map((n) => {
            const color = DECISION_BUCKETS[n.key].color;
            return (
              <g key={n.key}>
                <rect
                  x={DECISION_X}
                  y={n.y}
                  width={NODE_W}
                  height={n.h}
                  fill={color}
                  rx={2}
                />
                <text
                  x={DECISION_X + NODE_W + 6}
                  y={n.y + n.h / 2 + 3}
                  fontSize={12}
                  fontWeight={700}
                  fill="#e2e8f0"
                  textAnchor="start"
                >
                  {n.key}
                </text>
                <text
                  x={DECISION_X + NODE_W + 6}
                  y={n.y + n.h / 2 + 16}
                  fontSize={9}
                  fill="#94a3b8"
                  textAnchor="start"
                  fontWeight={500}
                >
                  {n.count} 位 ·{" "}
                  {Math.round(
                    (n.count / Math.max(1, decisionTotal)) * 100
                  )}
                  %
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover detail */}
      {filteredHover && (
        <div className="mt-3 bg-slate-800/60 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400 mb-1">
            <span className="text-slate-300 font-semibold">
              {filteredHover.from}
            </span>
            {" → "}
            <span
              className="font-semibold"
              style={{
                color: DECISION_BUCKETS[filteredHover.to].color,
              }}
            >
              {filteredHover.to}
            </span>
            <span className="text-slate-500"> · 共 {filteredHover.count} 位</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {filteredHover.personas.slice(0, 12).map((p) => (
              <span
                key={p.id}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300"
              >
                {p.archetype}：{p.name}
              </span>
            ))}
            {filteredHover.personas.length > 12 && (
              <span className="text-[10px] text-slate-500">
                + {filteredHover.personas.length - 12} 位
              </span>
            )}
          </div>
        </div>
      )}

      <footer className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-500 text-center">
        將 {entries.length} 段口語自白過濾為銀行可用的「投保／辦卡動機分析」
      </footer>
    </div>
  );
}

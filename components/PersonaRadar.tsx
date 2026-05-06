"use client";

import type { Persona } from "@/lib/agents/personas-data";
import {
  colorForPersona,
  computeRadarScores,
  RADAR_DIMENSIONS,
  type RadarScores,
} from "@/lib/persona-scores";

type Props = {
  personas: Persona[];
  /** 過濾／凸顯特定 ID（其他人變淡） */
  highlightId?: string;
  size?: number;
};

const W = 380;
const H = 360;

export function PersonaRadar({ personas, highlightId, size }: Props) {
  const w = size ?? W;
  const h = size ?? H;
  const cx = w / 2;
  const cy = h / 2 + 4;
  const R = Math.min(w, h) * 0.34;
  const dims = RADAR_DIMENSIONS;
  const angleFor = (i: number) =>
    -Math.PI / 2 + i * ((2 * Math.PI) / dims.length);

  // 5 圈刻度 (20, 40, 60, 80, 100)
  const grid = [20, 40, 60, 80, 100].map((s) =>
    dims
      .map((_, i) => {
        const a = angleFor(i);
        return `${cx + ((R * s) / 100) * Math.cos(a)},${
          cy + ((R * s) / 100) * Math.sin(a)
        }`;
      })
      .join(" ")
  );

  // 軸線 + 標籤
  const axes = dims.map((d, i) => {
    const a = angleFor(i);
    const x2 = cx + R * Math.cos(a);
    const y2 = cy + R * Math.sin(a);
    const lx = cx + (R + 22) * Math.cos(a);
    const ly = cy + (R + 22) * Math.sin(a);
    return { d, x2, y2, lx, ly, anchor: a };
  });

  // 每位 persona 的多邊形
  const polygons = personas.map((p, i) => {
    const scores = computeRadarScores(p);
    const points = dims
      .map((d, j) => {
        const s = scores[d.key];
        const a = angleFor(j);
        return `${cx + ((R * s) / 100) * Math.cos(a)},${
          cy + ((R * s) / 100) * Math.sin(a)
        }`;
      })
      .join(" ");
    const color = colorForPersona(p.id, i);
    const dimmed = !!highlightId && highlightId !== p.id;
    return { p, points, color, dimmed, scores };
  });

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-5 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-violet-400 font-bold">
            人格顯影
          </div>
          <h3 className="text-base font-bold text-slate-100 leading-tight mt-0.5">
            {personas.length} 位虛擬受訪者 · 五維雷達圖
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            每條彩色多邊形 = 一位受訪者的決策維度輪廓
          </p>
        </div>
        <span className="text-[10px] text-slate-500 whitespace-nowrap">
          ⌬ 數據顯影中
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 items-center">
        {/* 雷達圖 SVG */}
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          className="mx-auto"
        >
          <defs>
            <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1e293b" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} fill="url(#radarBg)" />

          {/* 圈線 */}
          {grid.map((g, i) => (
            <polygon
              key={i}
              points={g}
              fill="none"
              stroke="#334155"
              strokeWidth={i === grid.length - 1 ? 1.2 : 0.5}
              strokeDasharray={i === grid.length - 1 ? "" : "2 3"}
            />
          ))}

          {/* 軸線 */}
          {axes.map((a, i) => (
            <g key={i}>
              <line
                x1={cx}
                y1={cy}
                x2={a.x2}
                y2={a.y2}
                stroke="#334155"
                strokeWidth={0.8}
              />
              <text
                x={a.lx}
                y={a.ly}
                fontSize={11}
                fontWeight={600}
                fill="#cbd5e1"
                textAnchor={
                  Math.cos(a.anchor) > 0.3
                    ? "start"
                    : Math.cos(a.anchor) < -0.3
                    ? "end"
                    : "middle"
                }
                dominantBaseline={
                  Math.sin(a.anchor) > 0.3
                    ? "hanging"
                    : Math.sin(a.anchor) < -0.3
                    ? "auto"
                    : "middle"
                }
              >
                {a.d.label}
              </text>
            </g>
          ))}

          {/* 各 persona polygon — 從中心展開的 CSS 動畫 */}
          {polygons.map((poly, i) => (
            <polygon
              key={poly.p.id}
              points={poly.points}
              fill={poly.color}
              fillOpacity={poly.dimmed ? 0.05 : 0.18}
              stroke={poly.color}
              strokeOpacity={poly.dimmed ? 0.25 : 0.85}
              strokeWidth={poly.dimmed ? 1 : 1.6}
              style={{
                transformOrigin: `${cx}px ${cy}px`,
                animation: `radarReveal 600ms ${i * 60}ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards`,
              }}
            />
          ))}

          {/* 中心點 */}
          <circle cx={cx} cy={cy} r={2} fill="#94a3b8" />

          <style>{`
            @keyframes radarReveal {
              from { transform: scale(0); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }
          `}</style>
        </svg>

        {/* 圖例 */}
        <div className="space-y-1 max-h-[330px] overflow-y-auto pr-1 text-[11px]">
          {polygons.map((poly) => (
            <div
              key={poly.p.id}
              className={`flex items-center gap-2 ${
                poly.dimmed ? "opacity-40" : ""
              }`}
              title={`${poly.p.archetype}：${poly.p.name}`}
            >
              <span
                className="w-3 h-3 rounded-sm shrink-0 border border-slate-700"
                style={{ backgroundColor: poly.color }}
              />
              <span className="text-slate-300 truncate flex-1 min-w-0">
                <span className="text-slate-500">{poly.p.archetype}</span>
                <span className="mx-1 text-slate-600">·</span>
                <span className="text-slate-100 font-medium">
                  {poly.p.name}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <footer className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-500 text-center">
        分數由「年齡 × 收入 × 家庭 × 性格 × 資產」啟發式推算
      </footer>
    </div>
  );
}

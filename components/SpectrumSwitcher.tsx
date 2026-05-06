"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Persona } from "@/lib/agents/personas-data";
import {
  colorForPersona,
  computeRadarScores,
  detectProductType,
  productLabel,
  type ProductType,
  type RadarScores,
} from "@/lib/persona-scores";
import { useProductParams } from "@/lib/product-params-context";

type Props = {
  personas: Persona[];
  productContext?: string;
};

const PADDING = { top: 18, right: 24, bottom: 36, left: 44 };

type AxisCfg = {
  type: ProductType;
  icon: string;
  label: string; // 按鈕標籤
  yKey: keyof RadarScores;
  yLabel: string; // 軸標籤
  blurb: string;
};

const AXES: Record<ProductType, AxisCfg> = {
  creditcard: {
    type: "creditcard",
    icon: "💳",
    label: "信用卡",
    yKey: "digitalFluency",
    yLabel: "數位熟練度 →",
    blurb: "誰會用 APP 線上消費領回饋？",
  },
  loan: {
    type: "loan",
    icon: "💰",
    label: "信貸",
    yKey: "loanNeed",
    yLabel: "借貸需求度 →",
    blurb: "誰急需短期周轉現金？",
  },
  insurance: {
    type: "insurance",
    icon: "🛡",
    label: "保險",
    yKey: "economicPressure",
    yLabel: "經濟壓力（需求安全網）→",
    blurb: "誰最在意意外造成的家計斷層？",
  },
};

// Persona × Product 的「顯影」短句模板。針對 demo 人設手刻一兩句重點台詞，
// 其他用泛用模板補滿。每行帶一個 vibe 關鍵字讓觀眾秒懂這位在想什麼。
const VOICE: Record<string, Partial<Record<ProductType, string>>> = {
  uncle_zealot: {
    loan: "利率 6% 我可以接受，過 10% 我家就斷糧了。",
    insurance: "意外險我必買 — 兩個小孩跟老母親都靠我。",
    creditcard: "回饋 5% 加油那張我會辦，但我不刷餐廳。",
  },
  slasher_girl: {
    loan: "信貸我用不到，我有正職薪水當底。",
    insurance: "跑單時段的補強保險我願意試一個月看看。",
    creditcard: "回饋給力的我會立刻換主卡。",
  },
  rehab_youth: {
    loan: "我信用破產 — 利率再低也批不過。",
    insurance: "出事我家沒人能救，這個我要。",
    creditcard: "我辦不了卡，連申請都過不去。",
  },
  retired_lohas: {
    loan: "這年紀借錢沒意義，我有定存。",
    insurance: "醫療險才是重點，意外險我可有可無。",
    creditcard: "回饋我還行，但我只刷加油跟超市。",
  },
  student: {
    loan: "200 萬以下勉強，但我父母會殺了我。",
    insurance: "199 一個月對我來說有點吃緊。",
    creditcard: "我只能辦學生卡，有限額但我會用。",
  },
  returning_mom: {
    loan: "我借了還不起 — 老公收入不穩。",
    insurance: "兩個小孩，這保險我得算進家庭預算。",
    creditcard: "媽媽卡那種我會辦，蝦皮 Momo 回饋實在。",
  },
  quiet_landlord: {
    loan: "我不需要信貸，我用房貸轉融資。",
    insurance: "199 太貴，同樣保額我商業險才 80。",
    creditcard: "我只挑頂級卡，回饋率不到 2% 不辦。",
  },
  ex_engineer: {
    loan: "我有套牢的海外投資，借不到太多。",
    insurance: "我心血管病史 — 一定被加費或拒保。",
    creditcard: "我有竹科那批白金卡，沒打算換。",
  },
  indie_singer: {
    loan: "演出費都是現金，我借不到信貸。",
    insurance: "下個月我可能就停了，不能綁年約。",
    creditcard: "我刷的多是樂器，這類回饋少得可憐。",
  },
  nomad: {
    loan: "我有應急金，借錢的成本不划算。",
    insurance: "我比較三家比 199 低的，看條款。",
    creditcard: "出國回饋好我就換主卡。",
  },
};

// 自訂人設沒有手刻台詞時，依 persona 屬性挑句 — 同一人在不同產品也會講不同話
function generateVoice(p: Persona, type: ProductType): string {
  const text = `${p.archetype} ${p.personality} ${p.family} ${p.assetsAndEvents}`;
  const income = p.yearlyIncomeTWD;
  const hasDependents =
    /撫養|扶養|贍養|養.*孩|養.*家|負擔|支柱|單親|媽媽|爸爸|父親|母親/.test(
      text
    );
  const isPoor = income < 400_000;
  const isWealthy = income > 1_000_000;
  const badCredit = /破產|卡債|信用瑕疵|遲繳|被拒|信用空白/.test(text);
  const tech = /工程師|新創|APP|軟體|科技|遊牧|電腦|剪輯/.test(text);
  const conservative = /保守|穩定|定存|謹慎|細心|認真|傳統|樂活|不搶快/.test(
    text
  );
  const risky = /創業|投資|股市|加密|斜槓|追求|夢想|改裝|叛逆/.test(text);
  const sick = /心血管|疾病|長期服藥|健康|憂鬱/.test(text);
  const old = p.age >= 55;
  const young = p.age <= 25;
  const middleAged = p.age >= 35 && p.age < 55;

  if (type === "loan") {
    if (badCredit) return "我信用紀錄不好 — 利率再低也批不過。";
    if (isWealthy) return "我有其他周轉管道，信貸不是首選。";
    if (hasDependents && isPoor) return "借了我還不起 — 家裡靠我撐著。";
    if (hasDependents) return `${p.age} 歲還在養家，借錢要算清楚還得起。`;
    if (old) return "我這年紀借錢沒太大意義，定存夠用。";
    if (young && isPoor) return "額度太小、利率太高都不要 — 我跑單還不起。";
    if (young) return "如果是創業或進修我會考慮，但條件要透明。";
    if (risky) return "資金缺口我會借，但 IRR 我自己會算。";
    if (conservative) return "我不愛背債 — 利率超過 5% 我就放棄。";
    return `年利率 6% 是我心理上限，超過我就不申請。`;
  }

  if (type === "insurance") {
    if (sick) return "我有病史 — 怕被加費或拒保，條款要先看清楚。";
    if (hasDependents && isPoor)
      return "家裡有人靠我，這保險我得算進預算 — 但 199 我會猶豫。";
    if (hasDependents) return "出事的話小孩跟家計怎麼辦，這個我會買。";
    if (isWealthy) return "我已有商業險，CP 值我會比過再說。";
    if (old) return "醫療理賠才是重點，意外險可有可無。";
    if (young && isPoor) return "199 一個月對我預算來說有點吃緊。";
    if (young) return "月繳能停我才買，不要綁年約。";
    if (risky) return "下個月我可能就轉行了，要能彈性退保。";
    if (conservative) return "我看條款 — 既往症不賠的我就不買。";
    return `我先試一個月，理賠速度我朋友踩過雷。`;
  }

  // creditcard
  if (badCredit) return "我辦不了卡 — 連申請都過不去。";
  if (isWealthy) return "頂級卡才考慮，回饋不到 2% 我懶得開。";
  if (tech) return "回饋好 + APP 體驗順我就換主卡。";
  if (old) return "我刷的少，回饋對我吸引力一般。";
  if (young && isPoor) return "我只能辦學生卡 — 有限額但累積信用用。";
  if (young) return "回饋率夠高我立刻換，但我不刷大餐。";
  if (hasDependents) return "媽媽 / 爸爸卡那種我會辦，民生消費回饋最實在。";
  if (conservative) return "我只刷加油跟超市，回饋我精算過。";
  if (middleAged) return "外送平台 3% 對我有感，但綁帳號要看條款。";
  return `${p.age} 歲了，年費 0 + 加油回饋我才考慮辦。`;
}

export function SpectrumSwitcher({ personas, productContext }: Props) {
  const { type, setType } = useProductParams();

  const detected = useMemo(
    () => detectProductType(productContext ?? ""),
    [productContext]
  );

  // 第一次掛載 + productContext 變動時自動切到偵測到的類型
  useEffect(() => {
    setType(detected);
  }, [detected, setType]);

  const cfg = AXES[type];
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const points = useMemo(() => {
    return personas.map((p, i) => {
      const scores = computeRadarScores(p);
      // X 固定：財務健康度 = 100 - 經濟壓力
      const x = 100 - scores.economicPressure;
      // Y 依產品換軸
      const y = scores[cfg.yKey];
      return {
        persona: p,
        x,
        y,
        color: colorForPersona(p.id, i),
        idx: i,
      };
    });
  }, [personas, cfg.yKey]);

  const W = 460;
  const H = 320;
  const innerW = W - PADDING.left - PADDING.right;
  const innerH = H - PADDING.top - PADDING.bottom;
  const xScale = (x: number) => PADDING.left + (x / 100) * innerW;
  const yScale = (y: number) => PADDING.top + innerH - (y / 100) * innerH;

  // 從 personas 隨機 / 確定性抽 3 位顯示對話泡（用 hash 保持穩定）
  const featured = useMemo(() => {
    if (personas.length <= 3) return personas;
    return [personas[0], personas[Math.floor(personas.length / 2)], personas[personas.length - 1]];
  }, [personas]);

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-5 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-violet-400 font-bold">
            🏛 受訪者顯影 · {cfg.icon} {cfg.label}
          </div>
          <h3 className="text-base font-bold text-slate-100 leading-tight mt-0.5">
            {personas.length} 位受訪者的「{productLabel(type)}」維度
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{cfg.blurb}</p>
        </div>
        <Link
          href="/simulation"
          className="text-[11px] text-violet-300 hover:text-violet-200 border border-violet-500/40 hover:border-violet-400 hover:bg-violet-500/10 rounded-md px-2.5 py-1 whitespace-nowrap transition shrink-0"
          title="進入模擬艙"
        >
          🛰 進入模擬艙 →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* === 左：光譜 === */}
        <div className="bg-slate-950/40 rounded-xl border border-slate-800 p-2">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* 四象限淡底 */}
            <rect x={xScale(50)} y={yScale(100)} width={xScale(100) - xScale(50)} height={yScale(50) - yScale(100)} fill="#10b98112" />
            <rect x={xScale(0)} y={yScale(100)} width={xScale(50) - xScale(0)} height={yScale(50) - yScale(100)} fill="#fbbf2410" />
            <rect x={xScale(50)} y={yScale(50)} width={xScale(100) - xScale(50)} height={yScale(0) - yScale(50)} fill="#60a5fa10" />
            <rect x={xScale(0)} y={yScale(50)} width={xScale(50) - xScale(0)} height={yScale(0) - yScale(50)} fill="#fb718512" />

            {/* 軸線 */}
            <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={H - PADDING.bottom} stroke="#475569" strokeWidth={0.8} />
            <line x1={PADDING.left} y1={H - PADDING.bottom} x2={W - PADDING.right} y2={H - PADDING.bottom} stroke="#475569" strokeWidth={0.8} />
            {/* 中線 */}
            <line x1={xScale(50)} x2={xScale(50)} y1={PADDING.top} y2={H - PADDING.bottom} stroke="#334155" strokeWidth={0.5} strokeDasharray="2 3" />
            <line x1={PADDING.left} x2={W - PADDING.right} y1={yScale(50)} y2={yScale(50)} stroke="#334155" strokeWidth={0.5} strokeDasharray="2 3" />

            {/* 刻度 */}
            {[0, 50, 100].map((v) => (
              <g key={`xt-${v}`}>
                <text x={xScale(v)} y={H - PADDING.bottom + 14} fontSize={9} fill="#64748b" textAnchor="middle">{v}</text>
              </g>
            ))}
            {[0, 50, 100].map((v) => (
              <g key={`yt-${v}`}>
                <text x={PADDING.left - 6} y={yScale(v) + 3} fontSize={9} fill="#64748b" textAnchor="end">{v}</text>
              </g>
            ))}

            {/* 軸標籤 */}
            <text x={PADDING.left + innerW / 2} y={H - 4} fontSize={10} fontWeight={600} fill="#cbd5e1" textAnchor="middle">
              財務健康度 →
            </text>
            <text x={-(PADDING.top + innerH / 2)} y={11} fontSize={10} fontWeight={600} fill="#cbd5e1" textAnchor="middle" transform="rotate(-90)">
              {cfg.yLabel}
            </text>

            {/* 散點 — Y 換軸時 cy 平滑過渡 */}
            {points.map((pt) => {
              const isHover = hoverIdx === pt.idx;
              return (
                <circle
                  key={pt.persona.id}
                  cx={xScale(pt.x)}
                  cy={yScale(pt.y)}
                  r={isHover ? 7 : 5}
                  fill={pt.color}
                  fillOpacity={isHover ? 0.95 : 0.78}
                  stroke="#0b1020"
                  strokeWidth={1}
                  style={{
                    transition:
                      "cx 700ms cubic-bezier(0.34, 1.56, 0.64, 1), cy 700ms cubic-bezier(0.34, 1.56, 0.64, 1), r 150ms ease",
                    cursor: "pointer",
                  }}
                  onMouseEnter={() => setHoverIdx(pt.idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                />
              );
            })}

            {hoverIdx !== null && (
              <g
                style={{ pointerEvents: "none" }}
                transform={`translate(${xScale(points[hoverIdx].x) + 10}, ${yScale(points[hoverIdx].y) - 10})`}
              >
                <rect x={0} y={-30} width={170} height={36} rx={4} fill="#0f172a" stroke="#475569" />
                <text x={6} y={-16} fontSize={10} fill="#cbd5e1">
                  {points[hoverIdx].persona.archetype}：{points[hoverIdx].persona.name}
                </text>
                <text x={6} y={-2} fontSize={9} fill="#94a3b8">
                  健康度 {points[hoverIdx].x} · {cfg.yLabel.replace(" →", "")} {points[hoverIdx].y}
                </text>
              </g>
            )}
          </svg>
        </div>

        {/* === 右：對話顯影 === */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
            顯影 · 受訪者口吻
          </div>
          {featured.map((p, i) => {
            const color = colorForPersona(p.id, personas.indexOf(p));
            const line = VOICE[p.id]?.[type] ?? generateVoice(p, type);
            return (
              <div
                key={`${p.id}-${type}`}
                className="bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5 flex gap-2.5"
                style={{
                  animation: "spectrum-fade 360ms ease",
                }}
              >
                <span
                  className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                  style={{ background: color }}
                />
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-300 font-semibold leading-tight">
                    {p.archetype} · {p.name}
                    <span className="text-slate-500 font-normal ml-1.5">
                      {p.age}/{p.gender}
                    </span>
                  </div>
                  <div className="text-[12px] text-slate-100 leading-snug mt-1">
                    「{line}」
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        @keyframes spectrum-fade {
          from {
            opacity: 0;
            transform: translateY(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

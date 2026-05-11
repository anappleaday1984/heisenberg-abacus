"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AbacusBar } from "./AbacusBar";
import { DecisionSankey } from "./DecisionSankey";
import { PhaseTransitionMap } from "./PhaseTransitionMap";
import { usePersonaSession } from "@/lib/persona-session-context";
import { VoiceControl } from "./VoiceControl";
import {
  DEMO_PERSONAS,
  DEMO_QA_ENTRIES,
  DEMO_PRODUCT_CONTEXT,
} from "@/lib/demo-data";

export function SimulationLab() {
  const { personas, qaEntries, productContext } = usePersonaSession();

  const isLive = personas !== null || qaEntries !== null;

  const effective = useMemo(() => {
    if (isLive) {
      const live = qaEntries ?? [];
      return {
        personas: personas ?? live.map((e) => e.persona),
        qaEntries: live,
        productContext: productContext ?? "",
      };
    }
    return {
      personas: DEMO_PERSONAS,
      qaEntries: DEMO_QA_ENTRIES,
      productContext: DEMO_PRODUCT_CONTEXT,
    };
  }, [isLive, personas, qaEntries, productContext]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <header className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-950/80 backdrop-blur z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded-md px-3 py-1.5 whitespace-nowrap"
          >
            ← 返回觀測站
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-slate-100">
              🛰 環境壓力模擬艙
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Stress-Pod · 觀測族群在不同壓力參數下的行為相變
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* 語音肥皂 + 回到入口 — 跟主畫面一致放在 header 右側群組 */}
          <VoiceControl />
          <span
            className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border ${
              isLive
                ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
                : "text-amber-300 border-amber-500/40 bg-amber-500/10"
            }`}
          >
            {isLive ? "● 連線中｜當前 session 資料" : "○ 示範資料｜尚未進行調查"}
          </span>
        </div>
      </header>

      {/* === 主體 === */}
      {/* 上半:既有的「行為相變」+「桑基決策」雙欄
          下半:新增的「收益甜蜜點 + CLV + 壓力測試」業務 / 風控 / 行銷三決策層 */}
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section>
              <SectionHeader
                tag="01 · Behavioral Phase Transition"
                title="行為相變散佈圖"
              />
              <PhaseTransitionMap
                personas={effective.personas}
                productContext={effective.productContext}
                showSlider={false}
              />
            </section>

            <section>
              <SectionHeader
                tag="02 · Stress-Induced Sankey"
                title="外在變因下的決策變化"
              />
              {effective.qaEntries.length > 0 ? (
                <DecisionSankey entries={effective.qaEntries} />
              ) : (
                <div className="text-center text-sm text-slate-400 border border-dashed border-slate-700 rounded-2xl p-10">
                  尚無 Q&A 資料 — 請先回到觀測站完成一輪調查。
                </div>
              )}
            </section>
          </div>

        </div>
      </main>

      {/* === 底部：算盤調整 bar（產品 toggle + 滑桿，全寬 sticky） === */}
      <footer className="border-t border-slate-800 bg-slate-950/95 backdrop-blur px-6 py-4 shrink-0">
        <div className="max-w-7xl mx-auto">
          <AbacusBar />
        </div>
      </footer>
    </div>
  );
}

function SectionHeader({
  tag,
  title,
  blurb,
}: {
  tag: string;
  title: string;
  blurb?: string;
}) {
  return (
    <div className="mb-3">
      <div className="text-[10px] uppercase tracking-wider text-violet-400 font-bold">
        {tag}
      </div>
      <h2 className="text-base font-bold text-slate-100 leading-tight mt-0.5">
        {title}
      </h2>
      {blurb && <p className="text-[11px] text-slate-400 mt-0.5">{blurb}</p>}
    </div>
  );
}

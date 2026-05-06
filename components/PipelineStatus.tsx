"use client";

export type PipelineStage =
  | "idle"
  | "entry"
  | "pm-plan"
  | "persona"
  | "summary"
  | "pm-report"
  | "complete";

type Props = {
  stage: PipelineStage;
  detail?: string;
};

const STAGES: Array<{
  key: Exclude<PipelineStage, "idle">;
  label: string;
  agent: string;
  color: string;
}> = [
  { key: "entry", label: "定位光譜", agent: "啟動者", color: "bg-blue-500" },
  { key: "pm-plan", label: "規劃調查", agent: "觀測者", color: "bg-violet-500" },
  { key: "persona", label: "受訪者顯影", agent: "對話者", color: "bg-emerald-500" },
  { key: "summary", label: "資訊彙集", agent: "彙總者", color: "bg-amber-500" },
  { key: "pm-report", label: "回報結果", agent: "觀測者", color: "bg-rose-500" },
];

export function PipelineStatus({ stage, detail }: Props) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  const isComplete = stage === "complete";
  const isIdle = stage === "idle";
  const activeStage = STAGES[idx] ?? null;

  // 進度：完成時 100%，其他時候 = (已完成階段數 / 總) ; idle 時 0
  const progressIndex = isComplete ? STAGES.length : Math.max(0, idx + 1);
  const progressPct = isIdle
    ? 0
    : Math.min(100, (progressIndex / STAGES.length) * 100);

  return (
    <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-xl px-4 py-2.5 mb-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isIdle ? (
            <>
              <div className="w-2 h-2 rounded-full bg-slate-600" />
              <span className="text-xs text-slate-500">
                等待輸入 — Multi-agent 流程待命中
              </span>
            </>
          ) : isComplete ? (
            <>
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-emerald-300 font-semibold">
                ✅ 報告生成完成
              </span>
              {detail && (
                <span className="text-xs text-slate-400 truncate">
                  · {detail}
                </span>
              )}
            </>
          ) : activeStage ? (
            <>
              <span className="relative flex w-2 h-2 shrink-0">
                <span
                  className={`absolute inset-0 rounded-full ${activeStage.color} opacity-60 animate-ping`}
                />
                <span
                  className={`relative w-2 h-2 rounded-full ${activeStage.color}`}
                />
              </span>
              <span className="text-xs font-semibold text-slate-100 truncate">
                {activeStage.agent} · {activeStage.label}
              </span>
              {detail && (
                <span className="text-xs text-slate-400 truncate">
                  · {detail}
                </span>
              )}
            </>
          ) : null}
        </div>
        <span className="text-[10px] text-slate-500 tabular-nums whitespace-nowrap">
          {isIdle
            ? "0 / " + STAGES.length
            : `${Math.min(progressIndex, STAGES.length)} / ${STAGES.length}`}
        </span>
      </div>

      {/* 階段 dots */}
      <div className="flex gap-1 mb-1.5">
        {STAGES.map((s, i) => {
          const done = !isIdle && i < idx;
          const active = !isIdle && !isComplete && i === idx;
          return (
            <div
              key={s.key}
              className={`flex-1 h-1 rounded-full transition-all ${
                isComplete
                  ? "bg-emerald-500"
                  : done
                  ? s.color
                  : active
                  ? `${s.color} animate-pulse`
                  : "bg-slate-700"
              }`}
            />
          );
        })}
      </div>

      {/* 階段名稱 row */}
      <div className="flex justify-between text-[9px] text-slate-500 tracking-wider">
        {STAGES.map((s, i) => {
          const isActive = !isIdle && !isComplete && i === idx;
          return (
            <span
              key={s.key}
              className={`flex-1 text-center ${
                isActive ? "text-slate-100 font-bold" : ""
              }`}
            >
              {s.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

import { NextResponse } from "next/server";
import { askPersona } from "@/lib/agents/persona";
import {
  getLLMTelemetry,
  resetLLMTelemetry,
  setLLMConcurrency,
} from "@/lib/anthropic";
import { getPersonas } from "@/lib/personas-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Benchmark 跑滿 30 受訪者 × 5 題、每組 4/8/16 各一輪，預估 5-15 分鐘。
// Vercel 預設 timeout 不夠，但這個 route 主要在開發機上跑。
export const maxDuration = 900;

const BENCHMARK_PRODUCT_CONTEXT = `本次測試的產品（虛擬，僅供 rate-limit benchmark 使用）：
某銀行新推出的外送員專屬信用卡：加油 5% 現金回饋（無上限）、外送平台消費 3% 回饋、
年費 0 元但需綁定外送平台帳號。`;

const QUESTION_BANK = [
  "如果有一張新信用卡每月在指定通路給 8% 無上限回饋、年費 NT$ 1800，你會辦嗎？為什麼？",
  "你最近一次因為哪個附加條件（最低消費、自動扣繳、登錄活動等）而放棄一個金融商品？發生什麼事？",
  "假設一個高利率定存利率 4.5%、但需要鎖 18 個月不能提前解約，你會把多少比例的閒錢放進去？",
  "看到「免手續費」「無上限」「最高」這類廣告詞時，你最警戒哪個關鍵字？為什麼？",
  "如果你身邊朋友推薦你一個新型投資商品，你最在意哪三個資訊才會考慮跟進？",
  "你比較信任本土銀行還是純網銀？實際決定開戶或申辦時，差別在哪？",
  "你心裡覺得「合理」的年費是多少？超過這個數字什麼回饋會讓你願意接受？",
];

function pctile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

type RunResult = {
  concurrency: number;
  personas: number;
  questions: number;
  totalCalls: number;
  totalAttempts: number;
  rateLimitHits: number;
  serverErrors: number;
  retryRate: number;
  successCount: number;
  failureCount: number;
  wallTimeMs: number;
  perPersonaAvgMs: number;
  perPersonaP50Ms: number;
  perPersonaP95Ms: number;
  totalBackoffMs: number;
};

async function runOne(opts: {
  level: number;
  personaSlice: ReturnType<typeof getPersonas>;
  questions: string[];
}): Promise<RunResult> {
  setLLMConcurrency(opts.level);
  resetLLMTelemetry();

  const durations: number[] = [];
  let success = 0;
  let failure = 0;
  const wallStart = Date.now();

  await Promise.all(
    opts.personaSlice.map(async (p) => {
      const t0 = Date.now();
      try {
        // benchmark 用一個固定 productContext 維持一致性
        await askPersona(p, opts.questions, BENCHMARK_PRODUCT_CONTEXT);
        success++;
      } catch {
        failure++;
      } finally {
        durations.push(Date.now() - t0);
      }
    })
  );

  const wallTime = Date.now() - wallStart;
  const tel = getLLMTelemetry();
  const sorted = [...durations].sort((a, b) => a - b);

  return {
    concurrency: opts.level,
    personas: opts.personaSlice.length,
    questions: opts.questions.length,
    totalCalls: tel.totalCalls,
    totalAttempts: tel.totalAttempts,
    rateLimitHits: tel.rateLimitHits,
    serverErrors: tel.serverErrors,
    retryRate:
      tel.totalCalls > 0
        ? (tel.totalAttempts - tel.totalCalls) / tel.totalCalls
        : 0,
    successCount: success,
    failureCount: failure,
    wallTimeMs: wallTime,
    perPersonaAvgMs:
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0,
    perPersonaP50Ms: pctile(sorted, 0.5),
    perPersonaP95Ms: pctile(sorted, 0.95),
    totalBackoffMs: tel.totalBackoffMs,
  };
}

/**
 * GET /api/benchmark?levels=4,8,16&personas=30&questions=5
 *
 * 跑完三輪會把目前的 LLM concurrency cap 留在最後一個 level 上。
 * 跑完後可以呼叫 PUT /api/benchmark { concurrency: N } 重設。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const levels = (url.searchParams.get("levels") ?? "4,8,16")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  const personasN = Math.max(
    1,
    Number(url.searchParams.get("personas") ?? 30)
  );
  const questionsN = Math.max(
    1,
    Math.min(QUESTION_BANK.length, Number(url.searchParams.get("questions") ?? 5))
  );

  const allPersonas = getPersonas();
  if (allPersonas.length === 0) {
    return NextResponse.json(
      { error: "personas.json is empty" },
      { status: 400 }
    );
  }
  const personaSlice = allPersonas.slice(0, personasN);
  const questions = QUESTION_BANK.slice(0, questionsN);

  const previousCap =
    Number(process.env.LLM_MAX_CONCURRENCY ?? 6) || 6;

  const results: RunResult[] = [];
  for (const level of levels) {
    const r = await runOne({ level, personaSlice, questions });
    results.push(r);
  }

  // 還原原本的 concurrency
  setLLMConcurrency(previousCap);

  return NextResponse.json({
    config: {
      personas: personaSlice.length,
      questions: questions.length,
      totalCallsPerRun: personaSlice.length * questions.length,
      levels,
    },
    results,
    generatedAt: new Date().toISOString(),
  });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { concurrency?: number };
  if (!body.concurrency || body.concurrency <= 0) {
    return NextResponse.json(
      { error: "concurrency must be a positive number" },
      { status: 400 }
    );
  }
  setLLMConcurrency(body.concurrency);
  return NextResponse.json({ concurrency: body.concurrency });
}

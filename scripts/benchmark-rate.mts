/**
 * Benchmark — 量化不同 LLM 並行度下的回應時間 / 429 發生率。
 *
 * 預設 30 位 personas × 5 題 = 150 次 LLM call，
 * 對 LLM_MAX_CONCURRENCY = 4 / 8 / 16 三種設定分別跑一輪，
 * 輸出 markdown 表格 + 寫到 docs/benchmark-rate-{timestamp}.md。
 *
 * 用法：
 *   node --env-file=.env.local scripts/benchmark-rate.mts
 *   node --env-file=.env.local scripts/benchmark-rate.mts --levels=4,8,16 --personas=30 --questions=5
 *   node --env-file=.env.local scripts/benchmark-rate.mts --quick  # 用較少 personas + 較少題目快測
 */
import { askPersona } from "../lib/agents/persona";
import {
  getLLMTelemetry,
  resetLLMTelemetry,
  setLLMConcurrency,
} from "../lib/anthropic";
import { getPersonas } from "../lib/personas-store";
import fs from "node:fs";
import path from "node:path";

type Args = {
  levels: number[];
  personas: number;
  questions: number;
  out?: string;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {
    levels: [4, 8, 16],
    personas: 30,
    questions: 5,
  };
  for (const a of argv) {
    if (a === "--quick") {
      args.personas = 10;
      args.questions = 3;
    } else if (a.startsWith("--levels=")) {
      args.levels = a
        .slice("--levels=".length)
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    } else if (a.startsWith("--personas=")) {
      args.personas = Number(a.slice("--personas=".length));
    } else if (a.startsWith("--questions=")) {
      args.questions = Number(a.slice("--questions=".length));
    } else if (a.startsWith("--out=")) {
      args.out = a.slice("--out=".length);
    }
  }
  return args;
}

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

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

type Row = {
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
  perCallAvgMs: number;
  perCallP50Ms: number;
  perCallP95Ms: number;
  perPersonaAvgMs: number;
  totalBackoffMs: number;
};

async function runOne(opts: {
  level: number;
  personas: ReturnType<typeof getPersonas>;
  questions: string[];
}): Promise<Row> {
  setLLMConcurrency(opts.level);
  resetLLMTelemetry();

  const personaDurations: number[] = [];
  let success = 0;
  let failure = 0;

  const wallStart = Date.now();

  // 跟生產環境一樣：一次 fan-out 全部 personas，由 semaphore 控制
  const promises = opts.personas.map(async (p) => {
    const t0 = Date.now();
    try {
      await askPersona(p, opts.questions, BENCHMARK_PRODUCT_CONTEXT);
      success++;
    } catch (err) {
      failure++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${p.archetype}：${p.name} → ${msg}`);
    } finally {
      personaDurations.push(Date.now() - t0);
    }
  });

  await Promise.all(promises);
  const wallTime = Date.now() - wallStart;

  const tel = getLLMTelemetry();
  const sorted = [...personaDurations].sort((a, b) => a - b);
  const totalCalls = tel.totalCalls;
  const avgPerCallMs = totalCalls > 0
    // 全 wall-time 時段的所有 call 平均；用 wallTime * concurrency / totalCalls 估
    // 更準的是用 totalAttempts，但實務上就用 wall * cap / calls 反推
    ? (wallTime * opts.level) / totalCalls
    : 0;

  return {
    concurrency: opts.level,
    personas: opts.personas.length,
    questions: opts.questions.length,
    totalCalls: tel.totalCalls,
    totalAttempts: tel.totalAttempts,
    rateLimitHits: tel.rateLimitHits,
    serverErrors: tel.serverErrors,
    retryRate: tel.totalCalls > 0
      ? (tel.totalAttempts - tel.totalCalls) / tel.totalCalls
      : 0,
    successCount: success,
    failureCount: failure,
    wallTimeMs: wallTime,
    perCallAvgMs: avgPerCallMs,
    perCallP50Ms: pctile(sorted, 0.5),
    perCallP95Ms: pctile(sorted, 0.95),
    perPersonaAvgMs:
      personaDurations.length > 0
        ? personaDurations.reduce((a, b) => a + b, 0) / personaDurations.length
        : 0,
    totalBackoffMs: tel.totalBackoffMs,
  };
}

function renderMarkdown(rows: Row[], args: Args): string {
  const ts = new Date().toISOString();
  const header = `# Rate-Limit Benchmark Report\n\n生成時間：${ts}\n受測對象：MiniMax Anthropic-compatible API (\`MiniMax-M2.5\`)\n\n## 測試設定\n- Personas：${args.personas} 位\n- Questions：每位 ${args.questions} 題（總計 ${args.personas * args.questions} 次 LLM call）\n- 並行度：${args.levels.join(", ")}\n- Retry：429/5xx exponential backoff + jitter（最多 5 次）\n\n## 結果\n`;
  const tableHeader = `\n| 並行度 | wall time | 完成 / 失敗 | 429 命中 | 重試率 | 受訪者平均 | 單呼叫 p50 | 單呼叫 p95 | 總 backoff |\n|---:|---:|---:|---:|---:|---:|---:|---:|---:|`;
  const tableRows = rows
    .map(
      (r) =>
        `| ${r.concurrency} | ${fmtMs(r.wallTimeMs)} | ${r.successCount} / ${r.failureCount} | ${r.rateLimitHits} | ${(r.retryRate * 100).toFixed(1)}% | ${fmtMs(r.perPersonaAvgMs)} | ${fmtMs(r.perCallP50Ms)} | ${fmtMs(r.perCallP95Ms)} | ${fmtMs(r.totalBackoffMs)} |`
    )
    .join("\n");

  const detail = rows
    .map(
      (r) =>
        `### concurrency = ${r.concurrency}\n- 總 LLM call：${r.totalCalls}\n- 總嘗試次數（含 retry）：${r.totalAttempts}\n- 429 命中：${r.rateLimitHits}\n- 5xx 命中：${r.serverErrors}\n- 受訪者完成：${r.successCount} / ${r.personas}\n- wall time：${fmtMs(r.wallTimeMs)}\n- backoff 累計：${fmtMs(r.totalBackoffMs)}`
    )
    .join("\n\n");

  return `${header}${tableHeader}\n${tableRows}\n\n## 詳細數據\n\n${detail}\n`;
}

async function main() {
  const args = parseArgs();
  const allPersonas = getPersonas();
  if (allPersonas.length === 0) {
    throw new Error("data/personas.json 是空的，跑不了 benchmark");
  }
  const personas = allPersonas.slice(0, args.personas);
  const questions = QUESTION_BANK.slice(0, args.questions);

  console.log(
    `\n=== Rate-Limit Benchmark ===\nPersonas: ${personas.length} / Questions: ${questions.length} / Levels: ${args.levels.join(", ")}\n`
  );

  const rows: Row[] = [];
  for (const level of args.levels) {
    console.log(`\n→ concurrency = ${level} ...`);
    const t0 = Date.now();
    const row = await runOne({ level, personas, questions });
    rows.push(row);
    console.log(
      `  done in ${fmtMs(Date.now() - t0)} | success=${row.successCount} fail=${row.failureCount} 429=${row.rateLimitHits} retry%=${(row.retryRate * 100).toFixed(1)}`
    );
  }

  const md = renderMarkdown(rows, args);
  const outDir = path.join(process.cwd(), "docs");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath =
    args.out ?? path.join(outDir, `benchmark-rate-${stamp}.md`);
  fs.writeFileSync(outPath, md, "utf-8");

  console.log("\n" + md);
  console.log(`\n✓ 報告已寫到 ${outPath}\n`);
}

main().catch((err) => {
  console.error("Benchmark 失敗：", err);
  process.exit(1);
});

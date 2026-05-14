/**
 * 重現性實驗 — 跑 4 組實驗設定,捕捉每次 orchestrate 的關鍵輸出,
 * 寫進 scripts/reproducibility-results.json 供 QA 引用。
 *
 * 用法:
 *   npx tsx scripts/reproducibility-experiment.mts
 *
 * 環境變數:需要 MINIMAX_API_KEY,腳本會自動讀 .env.local。
 *
 * 流程:
 *   1. 備份 data/personas.json
 *   2. 對 4 組實驗:寫 personas → 跑 orchestrate → 記錄輸出 → 重複
 *   3. 還原 data/personas.json(無論成功失敗都會還原,finally 保證)
 *
 * 4 組實驗:
 *   exp1_identical_3x3   — 3 個完全相同 persona,跑 3 次
 *   exp2_two_types_6x2   — 6 人分 2 類(各 3 人),跑 2 次
 *   exp3_six_types_6x2   — 6 人分 6 類,跑 2 次
 *   (exp1 同時涵蓋使用者 Q1/Q2 兩題:單次觀察 + 多次穩定性)
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ────────────────────────── 環境變數 ──────────────────────────
function loadEnvLocal() {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

if (!process.env.MINIMAX_API_KEY) {
  console.error("✗ MINIMAX_API_KEY 沒設,請放到 .env.local");
  process.exit(1);
}

// 動態 import — 因為 lib/anthropic.ts 在 module load 就會 throw,必須等 env 載入後。
// tsx 在 .mts → .ts 邊界把 named exports 包到 .default(CJS/ESM interop),所以撈 default.orchestrate。
const orchMod = (await import("../lib/orchestrator.ts")) as unknown as {
  orchestrate?: typeof import("../lib/orchestrator.ts").orchestrate;
  default?: { orchestrate: typeof import("../lib/orchestrator.ts").orchestrate };
};
const orchestrate = orchMod.orchestrate ?? orchMod.default?.orchestrate;
if (!orchestrate) {
  console.error("✗ 無法 import orchestrate function");
  process.exit(1);
}

// ────────────────────────── 實驗設定 ──────────────────────────

const PROMPT =
  "我想測試一個給外送員的微型信貸新方案:5 萬元額度、年利率 6.88%、30 秒線上審核撥款、還款期 6 個月。請幫我做市場調查,了解外送員對這個方案的接受度、痛點,以及什麼條件會讓他們放棄申請。";

// 樣板 persona:全職衝刺型「熱血大叔」
const TPL_UNCLE = {
  archetype: "全職衝刺型",
  name: "熱血大叔",
  gender: "男" as const,
  age: 42,
  yearlyIncomeTWD: 750_000,
  incomeBreakdown: "高工時全職,年收入約 70-80 萬",
  personality: "刻苦耐勞、對路線極其熟悉、重視效率",
  family: "撫養兩名國小子女及一名高齡母親",
  assetsAndEvents:
    "名下有一輛分期中的 125cc 機車,無不動產。原為工廠領班,因工廠遷往東南亞後失業,轉投外送產業以維持家庭生計。",
};

const TPL_SLASHER = {
  archetype: "補充收入型",
  name: "斜槓小資女",
  gender: "女" as const,
  age: 26,
  yearlyIncomeTWD: 600_000,
  incomeBreakdown: "正職 45 萬 + 外送 15 萬 = 60 萬",
  personality: "活潑、親切、擅長時間規劃",
  family: "未婚,單身,獨自在台北租屋,無須負擔家計",
  assetsAndEvents:
    "名下有一台新買的電動機車。利用下班與假日跑單,目標是存夠去日本遊學的學費。",
};

const TPL_REHAB = {
  archetype: "債務奮鬥型",
  name: "更生青年",
  gender: "男" as const,
  age: 30,
  yearlyIncomeTWD: 650_000,
  incomeBreakdown: "高工時全職,年收入約 65 萬",
  personality: "沉默寡言、生活規律、守時",
  family: "獨居,父母已離異且無往來",
  assetsAndEvents:
    "名下僅有一台老舊機車。曾因年輕創業失敗積欠百萬卡債,因信用破產無法在一般公司任職,透過外送現金流逐步還債。",
};

const TPL_LOHAS = {
  archetype: "退休二春型",
  name: "樂活大哥",
  gender: "男" as const,
  age: 62,
  yearlyIncomeTWD: 450_000,
  incomeBreakdown: "勞保年金 + 外送約 20 萬 = 45 萬",
  personality: "隨緣、喜歡聊天、不搶快",
  family: "子女皆已成年出社會,無經濟負擔",
  assetsAndEvents:
    "名下有一間無貸款的老公寓,有定存投資。跑外送是為了防止大腦退化並賺取自己的旅遊基金。",
};

const TPL_STUDENT = {
  archetype: "學生打工型",
  name: "熱血大學生",
  gender: "男" as const,
  age: 20,
  yearlyIncomeTWD: 180_000,
  incomeBreakdown: "外送兼差 + 父母補貼 = 18 萬",
  personality: "好奇、衝勁、對科技敏感",
  family: "與父母同住,無經濟負擔,父母為中產家庭",
  assetsAndEvents: "騎家裡買給他的二手機車。利用課餘跑單賺零用錢與遊戲課金。",
};

const TPL_FAMILY = {
  archetype: "家庭支柱型",
  name: "顧家爸爸",
  gender: "男" as const,
  age: 38,
  yearlyIncomeTWD: 850_000,
  incomeBreakdown: "全職外送 + 配偶兼差 = 85 萬",
  personality: "務實、重視家庭、保守",
  family: "已婚,妻子兼職,撫養 2 名國中生子女",
  assetsAndEvents:
    "與家人租賃公寓居住,有房貸頭期款儲蓄目標。希望靠外送替小孩存大學基金。",
};

function clone<T extends object>(tpl: T, id: string): T & { id: string } {
  return { ...tpl, id };
}

const EXPERIMENTS = [
  {
    key: "exp1_identical_3x3",
    label: "3 個完全相同 persona × 3 次",
    runs: 3,
    personas: [
      clone(TPL_UNCLE, "uncle_a"),
      clone(TPL_UNCLE, "uncle_b"),
      clone(TPL_UNCLE, "uncle_c"),
    ],
  },
  {
    key: "exp2_two_types_6x2",
    label: "6 人分 2 類(各 3 人)× 2 次",
    runs: 2,
    personas: [
      clone(TPL_UNCLE, "uncle_a"),
      clone(TPL_UNCLE, "uncle_b"),
      clone(TPL_UNCLE, "uncle_c"),
      clone(TPL_SLASHER, "slasher_a"),
      clone(TPL_SLASHER, "slasher_b"),
      clone(TPL_SLASHER, "slasher_c"),
    ],
  },
  {
    key: "exp3_six_types_6x2",
    label: "6 人分 6 類 × 2 次",
    runs: 2,
    personas: [
      clone(TPL_UNCLE, "uncle"),
      clone(TPL_SLASHER, "slasher"),
      clone(TPL_REHAB, "rehab"),
      clone(TPL_LOHAS, "lohas"),
      clone(TPL_STUDENT, "student"),
      clone(TPL_FAMILY, "family"),
    ],
  },
];

// ────────────────────────── persona pool 切換 ──────────────────────────

const DATA_PATH = join(process.cwd(), "data", "personas.json");
const BACKUP_PATH = join(process.cwd(), "data", "personas.backup.json");

function backupPool() {
  if (existsSync(DATA_PATH)) copyFileSync(DATA_PATH, BACKUP_PATH);
}
function restorePool() {
  if (existsSync(BACKUP_PATH)) {
    copyFileSync(BACKUP_PATH, DATA_PATH);
    console.log("✓ persona pool 已還原");
  }
}
function setPool(personas: unknown[]) {
  writeFileSync(DATA_PATH, JSON.stringify(personas, null, 2), "utf-8");
}

// ────────────────────────── 跑單次 ──────────────────────────

type RunResult = {
  durationSec: number;
  plan?: { summary: string; questions: string[] };
  personaAnswers: Array<{ id: string; archetype: string; name: string; answers: string[] }>;
  summary?: {
    headline?: string;
    keyTakeaway?: string;
    metrics?: Array<{ label: string; value: string; unit?: string; tone?: string }>;
    groups?: Array<{ name: string; score: number; highlight: string }>;
  };
  reportTitle?: string;
  errors: string[];
};

async function runOnce(): Promise<RunResult> {
  const start = Date.now();
  const result: RunResult = {
    durationSec: 0,
    personaAnswers: [],
    errors: [],
  };

  let pmPlanText = "";
  let summaryText = "";

  for await (const ev of orchestrate([], PROMPT)) {
    if (ev.type === "agent_text" && ev.agent === "pm" && ev.label === "規劃調查") {
      pmPlanText += ev.text;
    }
    if (ev.type === "agent_text" && ev.agent === "summary") {
      summaryText += ev.text;
    }
    if (ev.type === "personas_qa") {
      // 完整 QA 矩陣 — 取 personas 與 answers
      result.plan = result.plan ?? { summary: "", questions: ev.questions };
      result.plan.questions = ev.questions;
      result.personaAnswers = ev.entries.map((e: { persona: { id: string; archetype: string; name: string }; answers: string[] }) => ({
        id: e.persona.id,
        archetype: e.persona.archetype,
        name: e.persona.name,
        answers: e.answers,
      }));
    }
    if (ev.type === "agent_text" && ev.agent === "pm" && ev.label === "回報結果") {
      // 從 PM 報告抓 title (JSON 第一個 field)
      try {
        const m = ev.text.match(/"title"\s*:\s*"([^"]+)"/);
        if (m && !result.reportTitle) result.reportTitle = m[1];
      } catch {
        /* ignore */
      }
    }
    if (ev.type === "error") {
      result.errors.push(ev.message);
    }
  }

  // 解析 summary JSON
  try {
    const parsed = JSON.parse(summaryText);
    result.summary = {
      headline: parsed.headline,
      keyTakeaway: parsed.keyTakeaway,
      metrics: parsed.metrics,
      groups: parsed.groups,
    };
  } catch {
    /* summary 不是 JSON 就忽略 */
  }

  // 從 pmPlanText 拉 plan summary + questions
  const sumMatch = pmPlanText.match(/\*\*調查目標\*\*[::]\s*([\s\S]+?)\n\n\*\*問題\*\*/);
  if (sumMatch) {
    result.plan = result.plan ?? { summary: "", questions: [] };
    result.plan.summary = sumMatch[1].trim();
  }

  result.durationSec = Math.round((Date.now() - start) / 100) / 10;
  return result;
}

// ────────────────────────── 主流程 ──────────────────────────

async function main() {
  console.log("=== 重現性實驗 ===\n");
  if (process.env.DRY === "1") {
    console.log("✓ DRY=1 — import / env OK,4 組實驗共", EXPERIMENTS.reduce((s, e) => s + e.runs, 0), "次跑");
    console.log("  移除 DRY=1 開始正式實驗");
    return;
  }
  backupPool();
  console.log(`✓ 已備份 personas.json → personas.backup.json\n`);

  const allResults: Record<
    string,
    { label: string; personasCount: number; runs: RunResult[] }
  > = {};

  try {
    for (const exp of EXPERIMENTS) {
      console.log(`\n--- ${exp.key}:${exp.label} ---`);
      setPool(exp.personas);
      console.log(`  pool size = ${exp.personas.length}`);

      const runs: RunResult[] = [];
      for (let i = 0; i < exp.runs; i++) {
        console.log(`  ▶ 第 ${i + 1} 次跑 (預估 ~90 秒)...`);
        try {
          const r = await runOnce();
          runs.push(r);
          console.log(
            `    ✓ ${r.durationSec}s · ${r.personaAnswers.length} 位 · headline="${r.summary?.headline ?? "(無)"}"`
          );
        } catch (err) {
          console.error(`    ✗ 第 ${i + 1} 次失敗:`, err instanceof Error ? err.message : err);
          runs.push({
            durationSec: 0,
            personaAnswers: [],
            errors: [err instanceof Error ? err.message : String(err)],
          });
        }
      }
      allResults[exp.key] = {
        label: exp.label,
        personasCount: exp.personas.length,
        runs,
      };
    }
  } finally {
    restorePool();
  }

  const outPath = join(process.cwd(), "scripts", "reproducibility-results.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      { runAt: new Date().toISOString(), prompt: PROMPT, results: allResults },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`\n✓ 結果寫入 ${outPath}`);
}

await main();

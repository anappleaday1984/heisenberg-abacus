import fs from "fs";
import path from "path";
import { DEFAULT_PERSONAS, type Persona } from "./agents/personas-data";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_PATH = path.join(DATA_DIR, "personas.json");

// 預設人設來源 — 專案計畫 HackMD 的「人設設定」章節
export const HACKMD_PAGE_URL =
  "https://hackmd.io/oks6Y7BTSJWw3_GvISZujg?both#%E4%BA%BA%E8%A8%AD%E8%A8%AD%E5%AE%9A";
export const HACKMD_DOWNLOAD_URL =
  "https://hackmd.io/oks6Y7BTSJWw3_GvISZujg/download";

function ensureFile(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(
      DATA_PATH,
      JSON.stringify(DEFAULT_PERSONAS, null, 2),
      "utf-8"
    );
  }
}

export function getPersonas(): Persona[] {
  ensureFile();
  const raw = fs.readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw) as Persona[];
}

export function savePersonas(personas: Persona[]): void {
  ensureFile();
  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify(personas, null, 2),
    "utf-8"
  );
}

/**
 * 解析 HackMD 文件，回傳 Persona 陣列。
 * 支援任意數量的人設 — 只要符合下列格式：
 *
 *   ## N. {archetype}：{name}
 *   - **ID：** `xxx`（選填）
 *   - **性別 / 年齡：** 男 / 42 歲
 *   - **年收入：** NT$ 750,000（補充說明）
 *   - **人格特質：** ...
 *   - **家庭狀況：** ...
 *   - **資產與變故：** ...
 *
 * 標題層級（##/###）與欄位 key 內空白都容許，
 * 既支援目前 HackMD（## 同階）也支援早期版本（### 子標題）。
 *
 * 第二參數 existingPersonas 用來在重新匯入時保留 ID（若 archetype:name 相同）。
 */
export function parseHackmdMarkdown(
  markdown: string,
  existingPersonas: Persona[] = []
): Persona[] {
  // 不再鎖章節 — HackMD 上每個人設用「## N.」與「## 人設設定」同階，
  // 鎖章節反而會把人設切掉。直接掃整份文件抓「##+ 數字. archetype：name」區塊，
  // 區塊邊界落在下一個任意 ##+ 標題或檔尾。
  const blockRegex =
    /^#{2,}\s+\d+\.\s*(.+?)：(.+?)\s*$([\s\S]*?)(?=^#{2,}\s|$(?![\s\S]))/gm;
  const personas: Persona[] = [];
  let m: RegExpExecArray | null;

  while ((m = blockRegex.exec(markdown)) !== null) {
    const archetype = m[1].trim();
    const name = m[2].trim();
    const body = m[3];

    // 抓每個 bullet：  - **欄位：** 值   或  * **欄位：** 值
    const fields: Record<string, string> = {};
    const bulletRegex = /^\s*[-*]\s+\*\*([^*]+?)：\*\*\s*(.+?)\s*$/gm;
    let bm: RegExpExecArray | null;
    while ((bm = bulletRegex.exec(body)) !== null) {
      // 標準化 key：把「性別 / 年齡」與「性別/年齡」視為同一欄位
      const key = bm[1].replace(/\s+/g, "");
      fields[key] = bm[2].trim();
    }

    // 性別 + 年齡：例 "男 / 42 歲"
    const ga = (fields["性別/年齡"] ?? "").match(/(男|女)\s*\/\s*(\d+)/);
    const gender: "男" | "女" = ga ? (ga[1] as "男" | "女") : "男";
    const age = ga ? Number(ga[2]) : 0;

    // 年收入 — 優先抓「NT$ N」總額（任何級距都通用，含 18,000、30 億這種沒「萬」的）；
    // 退而求其次抓最後一個「N 萬」或「N~M 萬」當作總額。
    const incomeStr = fields["年收入"] ?? "";
    let yearlyIncomeTWD = 0;
    const ntMatch = incomeStr.match(/NT\$\s*([\d,]+)/i);
    if (ntMatch) {
      yearlyIncomeTWD = Number(ntMatch[1].replace(/,/g, ""));
    } else {
      const incomeMatches = [...incomeStr.matchAll(/(\d+)(?:~(\d+))?\s*萬/g)];
      if (incomeMatches.length > 0) {
        const last = incomeMatches[incomeMatches.length - 1];
        const lo = Number(last[1]);
        const hi = last[2] ? Number(last[2]) : lo;
        yearlyIncomeTWD = Math.round((lo + hi) / 2) * 10000;
      }
    }

    // ID：HackMD 上每個人設都直接寫 `- **ID：** \`xxx\``，優先沿用以保證引用一致。
    // 若沒寫，再退回用 archetype+name 對既有資料找 ID，最後才生成新 ID。
    const idField = (fields["ID"] ?? "").replace(/`/g, "").trim();
    const existing = existingPersonas.find(
      (p) => p.archetype === archetype && p.name === name
    );
    const id = idField || existing?.id || `hackmd_${personas.length + 1}`;

    personas.push({
      id,
      archetype,
      name,
      gender,
      age,
      yearlyIncomeTWD,
      incomeBreakdown: incomeStr.replace(/[。.]$/, ""),
      personality: (fields["人格特質"] ?? "").replace(/[。.]$/, ""),
      family: (fields["家庭狀況"] ?? "").replace(/[。.]$/, ""),
      assetsAndEvents: fields["資產與變故"] ?? "",
    });
  }

  return personas;
}

export async function fetchPersonasFromHackmd(): Promise<Persona[]> {
  const res = await fetch(HACKMD_DOWNLOAD_URL, {
    headers: { Accept: "text/markdown,text/plain" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HackMD 抓取失敗：HTTP ${res.status}`);
  }
  const md = await res.text();
  const existing = fs.existsSync(DATA_PATH) ? getPersonas() : [];
  const parsed = parseHackmdMarkdown(md, existing);
  if (parsed.length === 0) {
    throw new Error("從 HackMD 解析到 0 位受訪者 — 請確認文件格式");
  }
  return parsed;
}

export function personasToMarkdown(personas: Persona[]): string {
  const header = `# 海森堡的算盤 — 受訪者設定\n\n共 ${personas.length} 位虛擬受訪者\n\n`;
  const body = personas
    .map(
      (p, i) => `## ${i + 1}. ${p.archetype}：${p.name}
- **ID：** \`${p.id}\`
- **性別 / 年齡：** ${p.gender} / ${p.age} 歲
- **年收入：** NT$ ${p.yearlyIncomeTWD.toLocaleString()}（${p.incomeBreakdown}）
- **人格特質：** ${p.personality}
- **家庭狀況：** ${p.family}
- **資產與變故：** ${p.assetsAndEvents}`
    )
    .join("\n\n");
  return header + body + "\n";
}

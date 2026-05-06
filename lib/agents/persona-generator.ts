import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "../anthropic";
import { extractJson } from "./json-extractor";
import type { Persona } from "./personas-data";
import { LANG_RULE } from "./shared-rules";

const SYSTEM = `${LANG_RULE}

你是「海森堡的算盤」的受訪者生成 Agent。任務：根據使用者的自然語言描述，**擴充**現有的受訪者池，生成符合條件的新虛擬受訪者。

## 輸出格式（嚴格遵守）
**必須**回傳 JSON array，包在 \`\`\`json fenced block 裡，即使只有 1 位也要包成 array：

\`\`\`json
[
  {
    "archetype": "類型名（例：入門工程師、退休老兵、補習班老師、創業中的設計師）",
    "name": "別稱（例：菜鳥小明、老兵阿伯、補教教主、瘋狂設計師）",
    "gender": "男",
    "age": 30,
    "yearlyIncomeTWD": 1000000,
    "incomeBreakdown": "收入結構說明（例：軟體公司正職 100 萬）",
    "personality": "人格特質一句話（要立體、有畫面）",
    "family": "家庭狀況一句話",
    "assetsAndEvents": "資產與人生背景 2-3 句，要包含為什麼會跑外送、有什麼財務煩惱"
  }
]
\`\`\`

## 規則
1. 每位受訪者要**立體獨特** — 不要只改名字其他複製貼上；同類型的 5 位也要有微妙差異（例：年齡稍差、家庭背景不同、性格傾向不同）
2. 給的描述若不夠精準（例：沒講性別比、沒講具體職業），自由發揮補足合理細節
3. 全程**繁體中文 + 台灣用語**
4. **不要**附帶 \`id\` 欄位（系統會自動生成）
5. 數量上限：每次最多 20 位
6. \`gender\` 只能是 "男" 或 "女"
7. \`age\` 跟 \`yearlyIncomeTWD\` 必須是整數
8. \`yearlyIncomeTWD\` 單位是元（例：1000000 = 100 萬）
9. 避免跟「現有受訪者池」中已存在的角色重複`;

export type GeneratedPersona = Omit<Persona, "id">;

export async function generatePersonas(
  userPrompt: string,
  existing: Persona[]
): Promise<GeneratedPersona[]> {
  const existingSummary =
    existing.length === 0
      ? "（目前沒有受訪者）"
      : existing
          .map(
            (p) =>
              `- ${p.archetype}：${p.name}（${p.gender}/${p.age}歲，年收入 ${p.yearlyIncomeTWD.toLocaleString()}）`
          )
          .join("\n");

  const fullPrompt = `## 現有的受訪者池（請避免完全重複）
${existingSummary}

## 使用者的擴充需求
${userPrompt}

請依規則生成 JSON array。`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: fullPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (response.stop_reason === "max_tokens") {
    throw new Error("生成器輸出被截斷（max_tokens 不夠）— 請減少要生成的人數");
  }

  const parsed = extractJson<unknown>(text, "生成器");

  if (!Array.isArray(parsed)) {
    throw new Error("生成器回傳的不是 array");
  }

  // Lightweight validation + coercion
  const result: GeneratedPersona[] = [];
  for (const item of parsed) {
    const p = item as Record<string, unknown>;
    if (!p.archetype || !p.name) continue;
    result.push({
      archetype: String(p.archetype),
      name: String(p.name),
      gender: p.gender === "女" ? "女" : "男",
      age: Number.isFinite(Number(p.age)) ? Number(p.age) : 30,
      yearlyIncomeTWD: Number.isFinite(Number(p.yearlyIncomeTWD))
        ? Number(p.yearlyIncomeTWD)
        : 500_000,
      incomeBreakdown: String(p.incomeBreakdown ?? ""),
      personality: String(p.personality ?? ""),
      family: String(p.family ?? ""),
      assetsAndEvents: String(p.assetsAndEvents ?? ""),
    });
  }

  if (result.length === 0) {
    throw new Error("生成 Agent 沒產出任何有效受訪者");
  }

  return result.slice(0, 20);
}

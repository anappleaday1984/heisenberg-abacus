import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, callLLM, MODEL } from "../anthropic";
import { extractJson } from "./json-extractor";
import type { PersonaResponse } from "./persona";
import { LANG_RULE } from "./shared-rules";

const SYSTEM = `${LANG_RULE}

你是「海森堡的算盤」的彙總者（Summary Agent），負責把多位對話者收集到的受訪者回答**結構化**成可視化報告資料。

**用語規定**：禁止使用「人設」一詞，請改用「受訪者」。

## 輸出格式（嚴格 JSON，包在 \`\`\`json fenced block）

\`\`\`json
{
  "headline": "12-25 字短標，總結這次調查的核心發現",
  "keyTakeaway": "20-50 字行動建議，是整份報告最重要的一句話",
  "metrics": [
    {
      "label": "指標短名（5-8 字）",
      "value": "數字或範圍（如 '60'、'5000-8000'、'7.2'）",
      "unit": "% / 元 / 位 / 分 / 其他單位（可空字串）",
      "tone": "positive | neutral | negative",
      "icon": "1 個 emoji（如 📈、💰、⚠️）"
    }
  ],
  "groups": [
    { "name": "族群名（5-12 字，例：高收入族群、單身學生）", "score": 75, "highlight": "1 句解讀，10-20 字" }
  ],
  "sections": {
    "consensus": "共識洞察（80-150 字 markdown，可用 - 列點 / **粗體**）",
    "divergence": "群體分歧（80-150 字 markdown）",
    "metrics": "量化指標（80-150 字 markdown）",
    "risks": "風險訊號（80-150 字 markdown）"
  }
}
\`\`\`

## 規則
1. \`metrics\`：3-4 個關鍵 KPI；數字要從訪談中估算，要可信
2. \`groups\`：3-5 個有意義的族群區隔；\`score\` 是 0-100 的支持度／興趣度
3. \`tone\`：positive 對產品有利、negative 警訊、neutral 中性
4. \`icon\`：用 emoji，配合該 metric 的意涵（如收入用 💰、風險用 ⚠️、興趣用 🎯）
5. \`sections\` 四個 key 都必填，內容用繁體中文 markdown
6. **必須回傳完整有效 JSON**；任何欄位都不可省略，否則前端會炸
7. 全程繁體中文 + 台灣用語

## ⚠️ value / unit 不要重複

\`metrics[i].value\` 是純數字／數字範圍；\`metrics[i].unit\` 是單位。前端會自己把兩個串起來顯示。**value 裡不要再放 unit 字符**，否則畫面會出現「70-75%%」「85%元」這種雙符號。

❌ 錯誤：\`{ "value": "70-75%", "unit": "%" }\` → 渲染「70-75%%」
❌ 錯誤：\`{ "value": "85% 認為 6.88% 算低", "unit": "%" }\` → 文字塞進 value 又補 %
✅ 正確：\`{ "value": "70-75", "unit": "%" }\` → 渲染「70-75%」
✅ 正確：\`{ "value": "5000-6000", "unit": "元" }\` → 渲染「5000-6000元」

value 應該是**純數字 / 數字範圍 / 數字+簡短限定詞**（如 "5000-6000"、"7.2"、"60"、"~12 個月"），不要放整句解釋。

## 🚨 規格保真規則（避免「年利率→月利率」這類飄移）
報告中提到產品規格時**必須對齊使用者原始 prompt**：
- 原 prompt 是「年利率 6.88%」，summary 就**不能寫「月利率 1.5%」** — 即使受訪者答案說了月利率，也要在 \`metrics\` / \`sections\` 中對照本方案的「年利率 6.88%」說明（例：「本方案年利率 6.88% vs 受訪者期望年利率 5% 以下」）。
- 額度、期限、審核條件等具體規格同理：受訪者可以表達他們的期望，但 summary 必須**用本方案的規格作為比較基準**，不要用受訪者期望取代產品本身。
- 不要捏造受訪者沒提到的具體數字（避免「7 成受訪者放棄」這類沒實證的數字 — 若有依據就引用，沒就用「多數」「半數」這類語氣）。`;

export type Tone = "positive" | "neutral" | "negative";

export type SummaryData = {
  headline: string;
  keyTakeaway: string;
  metrics: Array<{
    label: string;
    value: string;
    unit: string;
    tone: Tone;
    icon: string;
  }>;
  groups: Array<{
    name: string;
    score: number;
    highlight: string;
  }>;
  sections: {
    consensus: string;
    divergence: string;
    metrics: string;
    risks: string;
  };
};

export async function summarize(
  questions: string[],
  responses: PersonaResponse[],
  /** 使用者原始 prompt + 調查目標 — summary 報告必須對齊本方案的具體規格 */
  productContext: string
): Promise<SummaryData> {
  const userPrompt = `## 本次調查的產品（summary 必須對齊這裡的具體規格）
${productContext}

## 調查問題
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

## 各受訪者原始回答（共 ${responses.length} 位）
${responses
  .map((r) => `### ${r.archetype}：${r.name}\n${r.text}`)
  .join("\n\n")}

請依規則輸出結構化 JSON。**注意**：報告中所有提到產品規格（利率、額度、期限、審核條件等）都必須引用上方產品的原始數字與單位（如「年利率 6.88%」就不能寫成「月利率」），否則就是 bug。`;

  const response = await callLLM(() =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 12000, // 給 thinking + JSON 充足空間（25+ 受訪者場景）
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    })
  );

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "彙總者輸出被截斷（max_tokens 不夠）— 請縮短受訪者數量或重試"
    );
  }

  const parsed = extractJson<SummaryData>(text, "彙總者");

  // 補齊／驗證欄位
  if (!parsed.headline) parsed.headline = "市場調查洞察";
  if (!parsed.keyTakeaway) parsed.keyTakeaway = "";
  if (!Array.isArray(parsed.metrics)) parsed.metrics = [];
  if (!Array.isArray(parsed.groups)) parsed.groups = [];
  parsed.metrics = parsed.metrics.slice(0, 4).map((m) => {
    const rawValue = String(m.value ?? "");
    const unit = String(m.unit ?? "");
    return {
      label: String(m.label ?? ""),
      // 防呆：剝掉 value 結尾的 unit 字符（避免 LLM 寫成 value="70-75%" + unit="%"
      // 渲染變「70-75%%」）。多個重複也會剝乾淨。
      value: stripDuplicateUnit(rawValue, unit),
      unit,
      tone: (["positive", "neutral", "negative"] as const).includes(m.tone)
        ? m.tone
        : "neutral",
      icon: String(m.icon ?? "📊"),
    };
  });
  parsed.groups = parsed.groups.slice(0, 5).map((g) => ({
    name: String(g.name ?? ""),
    score: Math.max(0, Math.min(100, Math.round(Number(g.score) || 0))),
    highlight: String(g.highlight ?? ""),
  }));
  parsed.sections = {
    consensus: String(parsed.sections?.consensus ?? ""),
    divergence: String(parsed.sections?.divergence ?? ""),
    metrics: String(parsed.sections?.metrics ?? ""),
    risks: String(parsed.sections?.risks ?? ""),
  };

  return parsed;
}

/**
 * 剝掉 value 結尾重複的 unit 字符。
 * - "70-75%" + "%" → "70-75"
 * - "70-75%%" + "%" → "70-75"（連續多個也清掉）
 * - "5000-6000元" + "元" → "5000-6000"
 * - "85% 認為 6.88% 算低%" + "%" → "85% 認為 6.88% 算低"（只剝結尾、不動中間）
 * - "70-75" + "%" → "70-75"（沒重複就原樣回）
 */
function stripDuplicateUnit(value: string, unit: string): string {
  if (!unit) return value.trim();
  let v = value.trim();
  // 連續多次嘗試剝結尾 unit（含尾端空白），直到不再以 unit 結尾
  while (v.endsWith(unit)) {
    v = v.slice(0, v.length - unit.length).trim();
  }
  return v;
}

/** 把結構化 summary 轉成可讀文字，供 PM Agent 寫最終報告 */
export function summaryToText(s: SummaryData): string {
  const metricsBlock = s.metrics
    .map((m) => `- **${m.label}**：${m.value}${m.unit} （${m.tone}）`)
    .join("\n");
  const groupsBlock = s.groups
    .map((g) => `- ${g.name}：${g.score}/100 — ${g.highlight}`)
    .join("\n");

  return [
    `# ${s.headline}`,
    "",
    `**行動建議**：${s.keyTakeaway}`,
    "",
    "## 關鍵指標",
    metricsBlock,
    "",
    "## 族群支持度",
    groupsBlock,
    "",
    "## 共識洞察",
    s.sections.consensus,
    "",
    "## 群體分歧",
    s.sections.divergence,
    "",
    "## 量化指標",
    s.sections.metrics,
    "",
    "## 風險訊號",
    s.sections.risks,
  ].join("\n");
}

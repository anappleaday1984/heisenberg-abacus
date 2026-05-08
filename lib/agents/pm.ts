import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, callLLM, MODEL } from "../anthropic";
import { getPersonas } from "../personas-store";
import { extractJson } from "./json-extractor";
import { LANG_RULE } from "./shared-rules";
import type { ChatMessage } from "./types";

const PLAN_SYSTEM = `${LANG_RULE}

你是「海森堡的算盤」的「觀測者」（規劃調查階段），負責規劃市場調查。

你的工作：
1. 看完啟動者收集到的研究需求 + 使用者對話脈絡。
2. 設計 4-6 個會給對話者去問受訪者的問題，問題要：
   - 具體、可量化（願意付多少利率？借多久？）
   - 測試決策動機（為什麼會選 / 不選這個產品）
   - 揭露隱藏顧慮（怕什麼？什麼會讓他們放棄？）
3. 系統會把這些問題**並行訪談所有受訪者**（你不需要挑選），所以問題要設計成對所有族群都有意義（高/低收入、單身/家庭、各年齡）。

## 🚨 嚴格規則：問題必須引用使用者原始 prompt 的產品規格

設計問題時，**所有與產品相關的數字、單位、條件**都**必須照原 prompt 寫死進問題本文**，不要抽象化、不要改單位。常見錯誤是：

- ❌ 使用者寫「年利率 6.88%」，問題卻問「你能接受多少**月利率**？」（單位被偷換）
- ❌ 使用者寫「5 萬額度」，問題卻問「你需要多少借貸金額？」（規格被丟掉）
- ❌ 使用者寫「30 秒線上審核」，問題卻問「你重視審核速度嗎？」（具體數字被抹掉）

✅ 正確做法：
- 「**本方案年利率 6.88%、5 萬元額度、6 個月還款**，你願意申辦嗎？什麼條件會讓你放棄？」
- 「跟你目前用的信貸產品比，**6.88% 年利率**算高還是低？」

問題本文要**逐字**保留產品規格，受訪者才能針對這個方案回答，而不是憑印象答常識數字。

**用語規定**：禁止使用「人設」一詞，請改用「受訪者」。

**輸出格式**（嚴格遵守 JSON）：
\`\`\`json
{
  "summary": "一句話說明這次調查要驗證什麼",
  "questions": ["問題 1", "問題 2", "問題 3", "問題 4"],
  "scopeNote": "一句話說明這組問題如何兼顧不同族群"
}
\`\`\``;

const REPORT_SYSTEM = `${LANG_RULE}

你是「海森堡的算盤」的「觀測者」（回報結果階段），現在要把調查結果**結構化成決策報告 JSON**。

**用語規定**：禁止使用「人設」一詞，請改用「受訪者」。

## 輸出格式（嚴格 JSON，包在 \`\`\`json fenced block）

\`\`\`json
{
  "title": "20-30 字的報告標題（產品名 + 核心結論）",
  "executiveSummary": "60-100 字執行摘要：3 句話講完整體判斷與最重要結論，主管 30 秒看懂",
  "keyFindings": [
    {
      "icon": "1 個 emoji（如 🎯、💰、⚠️）",
      "title": "5-10 字標題",
      "headline": "1 句重點 (15-25 字)",
      "details": "詳細描述 (40-80 字，可包含具體數字/引用)",
      "metric": {
        "value": "數字或範圍（如 '60'、'5000-8000'）",
        "label": "5-10 字單位說明",
        "tone": "positive | neutral | negative"
      }
    }
  ],
  "groupComparison": {
    "headers": ["族群", "支持度", "主要顧慮", "建議方向"],
    "rows": [
      ["族群名（5-10 字）", "0-100 整數", "顧慮 (10-15 字)", "建議 (10-20 字)"]
    ]
  },
  "actionItems": [
    {
      "priority": "high | medium | low",
      "title": "5-10 字行動標題",
      "action": "具體做什麼 (30-50 字)",
      "expectedImpact": "預期效果 (15-30 字)"
    }
  ]
}
\`\`\`

## 規則
- \`keyFindings\` 必須 3-5 個，按重要性排序
- \`groupComparison.rows\` 必須 3-5 列，涵蓋不同族群（高/低支持度、不同人生階段）
- \`actionItems\` 必須 3-5 個，至少 1 個 high priority
- \`metric\` 是 optional，但有數字依據的 finding 一定要附
- 全部繁體中文台灣用語
- **必須回傳完整有效 JSON**，任何欄位都不可省略，否則前端會炸`;

export type PMPlan = {
  summary: string;
  questions: string[];
  scopeNote?: string;
};

export type Tone = "positive" | "neutral" | "negative";
export type Priority = "high" | "medium" | "low";

export type ReportData = {
  title: string;
  executiveSummary: string;
  keyFindings: Array<{
    icon: string;
    title: string;
    headline: string;
    details: string;
    metric?: {
      value: string;
      label: string;
      tone: Tone;
    };
  }>;
  groupComparison: {
    headers: string[];
    rows: string[][];
  };
  actionItems: Array<{
    priority: Priority;
    title: string;
    action: string;
    expectedImpact: string;
  }>;
};

export async function planSurvey(
  history: ChatMessage[],
  brief: string,
  /** 使用者原始 prompt 全文 — 含產品規格數字，避免 entry agent 摘要時失真 */
  userMessage: string
): Promise<PMPlan> {
  const personaList = getPersonas().map(
    (p) =>
      `- \`${p.id}\`: ${p.name}（${p.archetype}，${p.gender} ${p.age} 歲，年收入 NT$ ${p.yearlyIncomeTWD.toLocaleString()}）— ${p.family.split("，")[0]}`
  ).join("\n");

  const response = await callLLM(() =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: PLAN_SYSTEM + "\n\n可用受訪者池：\n" + personaList,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        {
          role: "user",
          content: `## 使用者原始需求（請逐字參照產品規格）
${userMessage}

## 啟動者整理過的接待結果（僅供參考，產品規格以上方原始需求為準）
${brief}

請規劃這次的調查 — 問題本文必須引用上面原始需求中的產品規格（年利率/額度/期限/審核條件等具體數字），不要改單位或抽象化。`,
        },
      ],
    })
  );

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (response.stop_reason === "max_tokens") {
    throw new Error("觀測者規劃輸出被截斷（max_tokens 不夠）");
  }
  return extractJson<PMPlan>(text, "觀測者");
}

export async function generateReport(
  plan: PMPlan,
  personaResponses: { archetype: string; name: string; text: string }[],
  summaryText: string,
  /** 使用者原始 prompt 全文 — 報告必須引用本方案的具體規格（年利率/額度等） */
  productContext: string
): Promise<ReportData> {
  // 受訪者答案做截斷 — 報告階段已有 summary 完整洞察，原文只需要片段做 quote
  // 避免 25 受訪者 × 1500 token = 37500 token context 把 max_tokens 全吃光
  const PER_PERSONA_LIMIT = 500;
  const personaSection = personaResponses
    .map((r) => {
      const t = r.text.length > PER_PERSONA_LIMIT
        ? r.text.slice(0, PER_PERSONA_LIMIT) + "…(後略)"
        : r.text;
      return `### ${r.archetype}：${r.name}\n${t}`;
    })
    .join("\n\n");

  const response = await callLLM(() =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000, // 報告 JSON + adaptive thinking 都需要空間
      thinking: { type: "adaptive" },
      system: REPORT_SYSTEM,
      messages: [
        {
          role: "user",
          content: `## 本次調查的產品（report 必須引用這裡的具體規格）
${productContext}

## 調查計畫
${plan.summary}

問題：
${plan.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

## 受訪者訪談原文（共 ${personaResponses.length} 位）
${personaSection}

## 已歸納的洞察
${summaryText}

請依規則輸出結構化 JSON 決策報告。報告中提到利率/額度/期限/審核條件等數字時，**必須對齊上方產品的原始規格**，不要改單位（例：原 prompt 是年利率 6.88% 就不要寫成月利率），不要捏造受訪者沒提到的具體數字。`,
        },
      ],
    })
  );

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (response.stop_reason === "max_tokens") {
    throw new Error("觀測者報告輸出被截斷（max_tokens 不夠）");
  }
  const parsed = extractJson<ReportData>(text, "觀測者");

  // 補齊／驗證
  if (!parsed.title) parsed.title = "市場調查決策報告";
  if (!parsed.executiveSummary) parsed.executiveSummary = "";
  if (!Array.isArray(parsed.keyFindings)) parsed.keyFindings = [];
  if (!Array.isArray(parsed.actionItems)) parsed.actionItems = [];
  if (!parsed.groupComparison) {
    parsed.groupComparison = { headers: [], rows: [] };
  }

  parsed.keyFindings = parsed.keyFindings.slice(0, 6).map((f) => ({
    icon: String(f.icon ?? "📌"),
    title: String(f.title ?? ""),
    headline: String(f.headline ?? ""),
    details: String(f.details ?? ""),
    metric: f.metric
      ? {
          value: String(f.metric.value ?? ""),
          label: String(f.metric.label ?? ""),
          tone: (["positive", "neutral", "negative"] as const).includes(
            f.metric.tone
          )
            ? f.metric.tone
            : "neutral",
        }
      : undefined,
  }));

  parsed.actionItems = parsed.actionItems.slice(0, 6).map((a) => ({
    priority: (["high", "medium", "low"] as const).includes(a.priority)
      ? a.priority
      : "medium",
    title: String(a.title ?? ""),
    action: String(a.action ?? ""),
    expectedImpact: String(a.expectedImpact ?? ""),
  }));

  parsed.groupComparison = {
    headers: (parsed.groupComparison.headers ?? []).map(String),
    rows: (parsed.groupComparison.rows ?? []).slice(0, 8).map((r) =>
      (Array.isArray(r) ? r : []).map(String)
    ),
  };

  return parsed;
}

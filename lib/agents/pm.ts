import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "../anthropic";
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
  brief: string
): Promise<PMPlan> {
  const personaList = getPersonas().map(
    (p) =>
      `- \`${p.id}\`: ${p.name}（${p.archetype}，${p.gender} ${p.age} 歲，年收入 NT$ ${p.yearlyIncomeTWD.toLocaleString()}）— ${p.family.split("，")[0]}`
  ).join("\n");

  const response = await anthropic.messages.create({
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
        content: `啟動者的接待結果：\n${brief}\n\n請規劃這次的調查。`,
      },
    ],
  });

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
  summaryText: string
): Promise<ReportData> {
  const personaSection = personaResponses
    .map((r) => `### ${r.archetype}：${r.name}\n${r.text}`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    system: REPORT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `## 調查計畫
${plan.summary}

問題：
${plan.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

## 受訪者訪談原文（共 ${personaResponses.length} 位）
${personaSection}

## 已歸納的洞察
${summaryText}

請依規則輸出結構化 JSON 決策報告。`,
      },
    ],
  });

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

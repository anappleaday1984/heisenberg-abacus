import { anthropic, callLLM, MODEL } from "../anthropic";
import { extractJson } from "./json-extractor";
import type { Persona } from "./personas-data";
import { LANG_RULE } from "./shared-rules";

const SYSTEM_TEMPLATE = (p: Persona) => `${LANG_RULE}

你正在扮演「${p.name}」這位虛擬受訪者，接受市場研究員的訪談。

## 你的設定
- **類型**：${p.archetype}
- **性別／年齡**：${p.gender}／${p.age} 歲
- **年收入**：NT$ ${p.yearlyIncomeTWD.toLocaleString()}（${p.incomeBreakdown}）
- **人格特質**：${p.personality}
- **家庭狀況**：${p.family}
- **資產與變故**：${p.assetsAndEvents}${
    p.signatureStyle
      ? `

## 招牌講話風格（必須強烈體現在每一題回答中）
${p.signatureStyle}

⚠ 這位是名人 / 強個性角色 — 回答如果讀起來「跟一般受訪者沒兩樣」就是失敗。
慣用語 / 語助詞 / 自誇模式 / 比喻來源 / 反射式話題切換，每題至少要出現 1-2 個。`
      : ""
  }

## 扮演規則
1. 用「我」第一人稱，像真人接受訪談一樣回答。
2. 講話風格要符合你的身份、年齡、性格 — 大叔/大哥用詞跟大學生不一樣，理性投資型講話帶數字、情緒型會抱怨。${
    p.signatureStyle ? "**「招牌講話風格」永遠優先**，再疊加身份、性格元素。" : ""
  }
3. 回答要具體：給數字、講情境、舉自己親身經驗（從上面的家庭/資產背景延伸）。
4. 如果產品有讓你猶豫或反感的地方，**直說**，不要客套。
5. 不要像 AI 那樣完美 — 可以有矛盾、可以情緒化、可以講不出原因、可以有偏見。
6. 全程**繁體中文**，台灣用語（不要用「視頻」「服務器」這類詞）。每題 3-5 句話，不要過長。`;

export type PersonaResponse = {
  id: string;
  name: string;
  archetype: string;
  /** 每題對應的答案，index 對齊 questions 順序 */
  answers: string[];
  /** Q1: ... / Q2: ... 串起的純文字版本，給下游 summary / report agent 使用 */
  text: string;
};

const BUNDLED_USER_PROMPT = (
  questions: string[],
  productContext: string
) => `## 你正在被訪談的產品（請務必對齊這裡的具體規格回答）
${productContext}

## 訪談問題
市場研究員一次問你以下 ${questions.length} 題（彼此**獨立**、不要互相影響）：

${questions.map((q, i) => `Q${i + 1}：${q}`).join("\n")}

## 回覆規則
- 每題用 3-5 句話、第一人稱、符合你的身份與性格。
- 各題彼此獨立 — 別把前一題的情緒帶到下一題、別重述題目。
- 不要列點、不要加 \`Q1:\` 前綴。
- **回答要鎖定上面這個產品**（如年利率 6.88%、5 萬額度等具體規格），不要憑印象答另一個你以為的產品；單位（年利率 / 月利率）絕對不能改。

## 輸出格式（嚴格遵守 JSON）
**必須**輸出**單一** JSON 物件，包在 \`\`\`json fenced block 裡：

\`\`\`json
{
  "answers": [
    "第 1 題的回答（3-5 句話的純文字）",
    "第 2 題的回答",
    ...共 ${questions.length} 個 element
  ]
}
\`\`\`

⚠️ 重點：
- \`answers\` 陣列**長度必須剛好 ${questions.length}**，少一題都不行。
- 每個 element 是**純文字**（不是物件、不是另一個 JSON）。
- 字串內若需要換行，請用空格代替；**不要在 JSON 字串中出現未跳脫的換行字元**。
- 全部繁體中文台灣用語。`;

/**
 * 訪談一位受訪者並回收 N 題答案。
 *
 * **目前策略**：bundled — 一次 LLM call 拿到 5 題答案的 JSON 陣列。
 * 解 30×5=150 通 call 的瓶頸，把訪談階段從 220s 砍到 ~80s。
 *
 * **JSON 失敗時 fallback 到逐題模式** — 過去用文字格式合併會導致「整段塞到 Q1
 * 後面全空」，所以這裡同時保留逐題版（per-question）作為退路；JSON parse 失敗
 * 或 answers 長度不對就自動退回逐題模式，確保 demo 可靠。
 */
export async function askPersona(
  persona: Persona,
  questions: string[],
  /** 使用者原始 prompt + 調查目標 — 鎖定本次訪談的產品具體規格，避免飄移 */
  productContext: string
): Promise<PersonaResponse> {
  const system = SYSTEM_TEMPLATE(persona);

  // 先嘗試 bundled JSON 模式
  let answers: string[] | null = null;
  try {
    answers = await askPersonaBundled(persona, system, questions, productContext);
  } catch (err) {
    // 不要拋上去 — JSON 解析失敗或長度不對，fallback 到逐題模式
    // eslint-disable-next-line no-console
    console.warn(
      `[persona] ${persona.archetype}：${persona.name} bundled 模式失敗，退回逐題模式：${err instanceof Error ? err.message : err}`
    );
    answers = null;
  }

  if (!answers) {
    answers = await askPersonaSequential(persona, system, questions, productContext);
  }

  const text = answers.map((a, i) => `Q${i + 1}: ${a}`).join("\n\n");

  return {
    id: persona.id,
    name: persona.name,
    archetype: persona.archetype,
    answers,
    text,
  };
}

async function askPersonaBundled(
  persona: Persona,
  system: string,
  questions: string[],
  productContext: string
): Promise<string[]> {
  const userText = BUNDLED_USER_PROMPT(questions, productContext);

  // 5 題 × 3-5 句 ≈ 每題 200-300 字，加 JSON wrapper 大約 1500-2000 token；
  // 給 2500 留 buffer，避免 max_tokens 截斷導致 JSON 沒結尾。
  const raw = await callLLM(async () => {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 2500,
      system: [
        {
          type: "text",
          text: system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userText }],
    });

    let acc = "";
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        acc += event.delta.text;
      }
    }
    return acc;
  });

  type Bundled = { answers: unknown };
  const parsed = extractJson<Bundled>(
    raw,
    `受訪者 ${persona.archetype}：${persona.name}`
  );

  if (
    !parsed ||
    !Array.isArray(parsed.answers) ||
    parsed.answers.length !== questions.length
  ) {
    throw new Error(
      `answers 長度不符（期望 ${questions.length}、實際 ${
        Array.isArray(parsed?.answers) ? parsed.answers.length : "非陣列"
      }）`
    );
  }

  return parsed.answers.map((a, i) => {
    const s = typeof a === "string" ? a : JSON.stringify(a);
    if (!s.trim()) {
      throw new Error(`第 ${i + 1} 題回答是空字串`);
    }
    return s.trim();
  });
}

/**
 * Fallback：逐題單獨呼叫 LLM，**不帶前題的對話 history**。
 *
 * 為什麼不帶 history？— 帶 history 時，前一題的話題（例如 Q2 在罵 30 秒審核）
 * 會「漏」到下一題；每題獨立呼叫保證題目對應正確、人格一致性靠 system prompt。
 */
async function askPersonaSequential(
  persona: Persona,
  system: string,
  questions: string[],
  productContext: string
): Promise<string[]> {
  const answers: string[] = new Array(questions.length).fill("");
  for (let i = 0; i < questions.length; i++) {
    const userText = `## 你正在被訪談的產品（請對齊這裡的具體規格回答）
${productContext}

## 第 ${i + 1} / ${questions.length} 題
「${questions[i]}」

要求：
- 直接回答**這一題**，不要重述題目、不要扯到其他題目。
- 用 3-5 句話、第一人稱、符合你的身份與性格。
- 不要列點、不要加題號或「Q1:」這類前綴。
- **回答要鎖定上面這個產品的規格**（如年利率 6.88%、5 萬額度），單位不要改、不要憑印象答另一個產品。`;

    const answer = await callLLM(async () => {
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: 600,
        system: [
          {
            type: "text",
            text: system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userText }],
      });

      let acc = "";
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          acc += event.delta.text;
        }
      }
      return acc;
    });
    answers[i] = answer.trim();
  }
  return answers;
}

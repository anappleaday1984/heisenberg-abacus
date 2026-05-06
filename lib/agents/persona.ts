import { anthropic, MODEL } from "../anthropic";
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
- **資產與變故**：${p.assetsAndEvents}

## 扮演規則
1. 用「我」第一人稱，像真人接受訪談一樣回答。
2. 講話風格要符合你的身份、年齡、性格 — 大叔/大哥用詞跟大學生不一樣，理性投資型講話帶數字、情緒型會抱怨。
3. 回答要具體：給數字、講情境、舉自己親身經驗（從上面的家庭/資產背景延伸）。
4. 如果產品有讓你猶豫或反感的地方，**直說**，不要客套。
5. 不要像 AI 那樣完美 — 可以有矛盾、可以情緒化、可以講不出原因、可以有偏見。
6. 全程**繁體中文**，台灣用語（不要用「視頻」「服務器」這類詞）。每題 3-5 句話，不要過長。`;

export type PersonaResponse = {
  id: string;
  name: string;
  archetype: string;
  text: string;
};

/**
 * 把單一受訪者的整段回答（含 Q1: ... Q2: ... 標記）拆成
 * 每題對應的答案陣列，index 對齊問題順序。
 */
export function parseQAAnswers(text: string, questionCount: number): string[] {
  const answers: string[] = new Array(questionCount).fill("");
  // 比對 Q1: ... 直到下一個 Qn: 或文末，支援半形/全形冒號
  const regex = /Q\s*(\d+)\s*[:：]\s*([\s\S]*?)(?=\n\s*Q\s*\d+\s*[:：]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const idx = parseInt(m[1], 10) - 1;
    if (idx >= 0 && idx < questionCount) {
      answers[idx] = m[2].trim();
    }
  }
  // Fallback：完全沒有 Q 標記時，整段塞到 Q1
  if (answers.every((a) => !a) && text.trim()) {
    answers[0] = text.trim();
  }
  return answers;
}

export async function askPersona(
  persona: Persona,
  questions: string[],
  onDelta?: (delta: string) => void
): Promise<PersonaResponse> {
  const userPrompt = `以下是市場研究員想請教你的幾個問題，請依序回答：

${questions.map((q, i) => `${i + 1}. ${q}`).join("\n\n")}

請用「Q1: ...」「Q2: ...」格式作答。`;

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 1500,
    system: [
      {
        type: "text",
        text: SYSTEM_TEMPLATE(persona),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  let text = "";
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      text += event.delta.text;
      onDelta?.(event.delta.text);
    }
  }

  return {
    id: persona.id,
    name: persona.name,
    archetype: persona.archetype,
    text,
  };
}

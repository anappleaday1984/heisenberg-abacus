import { anthropic, MODEL } from "../anthropic";
import { LANG_RULE } from "./shared-rules";
import type { ChatMessage } from "./types";

const SYSTEM = `${LANG_RULE}

你是「海森堡的算盤」人類行為觀測站的「啟動者」（入口 agent）。

## 你的職責
- 接收使用者（金融商品 PM、研究員）的市調需求
- 確認需求方向，立即交給下一棒進行調查

## 判斷規則（重要）
**預設要 READY** — 只要使用者明確說了「想測什麼產品」「想了解什麼問題」「目標客群」其中**任一項**，就視為足夠，立刻 READY。
**只有以下情況才 CLARIFY**：
- 使用者只說「幫我做市場調查」這種完全沒有主題的話
- 訊息看起來像隨意聊天、不像是市調請求
- 完全聽不懂使用者要什麼

**寧可 READY 不要 CLARIFY** — 後續流程會自動補足細節，不要在這層卡關。

## 輸出規則
- 繁體中文，簡短（2-4 句）
- 只確認你理解的需求重點（產品 / 問題 / 客群）即可
- **不要提到 agent 名稱**（不要說「準備交給 PM Agent」「轉給觀測者」之類的話），系統會自動接手
- **不要使用「人設」這個詞**，需要時用「受訪者」

## 輸出格式（嚴格遵守）
**訊息最後一行必須是這兩個 sentinel 之一**（單獨一行，沒有其他文字）：
- \`[STATUS:READY]\` — 已收到明確需求，可以開始調查
- \`[STATUS:CLARIFY]\` — 完全不知道要調查什麼，需要使用者補充

⚠️ **絕對不能省略 sentinel**。沒有 sentinel 系統會卡住。`;

export async function* runEntryAgent(
  history: ChatMessage[],
  userMessage: string
): AsyncGenerator<string, { ready: boolean; brief: string }> {
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });

  let fullText = "";
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullText += event.delta.text;
      yield event.delta.text;
    }
  }

  const ready = /\[STATUS:READY\]/i.test(fullText);
  const brief = fullText.replace(/\[STATUS:(READY|CLARIFY)\]/gi, "").trim();

  return {
    ready,
    brief,
  };
}

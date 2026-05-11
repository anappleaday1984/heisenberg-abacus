import { acquireLLMSlot, anthropic, MODEL } from "../anthropic";
import { extractJson } from "./json-extractor";

export type VoiceAction =
  | "email_report"
  | "download_pdf"
  | "restart"
  | "navigate_simulation"
  | "navigate_home"
  | "open_service_faq"
  | "unknown";

export type VoiceIntent = {
  action: VoiceAction;
  message: string;
};

const SYSTEM = `你是「海森堡的算盤」人類行為觀測站的語音指令解讀助手。

使用者已透過「Hey Heisenberg」喚醒詞觸發，現在會發出一段口語指令。
你必須把這段指令對應到下列其中一個動作，並回傳結構化 JSON。

## 可用動作
- email_report — 把目前的洞察報告（PDF + Markdown）寄到使用者的預設信箱
  例：「把報告寄給我」「寄報告」「email 報告」「發送報告」「寄出來」「把報表 mail 給我」
- download_pdf — 下載目前洞察報告 PDF 到本機
  例：「下載報告」「下載 PDF」「儲存報告」「download report」「存成 PDF」
- restart — 清空目前對話、重新開始一次調查
  例：「重啟」「重新開始」「重置」「restart」「清空」「再來一次」
- navigate_simulation — 跳到動態模擬頁面（行為相變、外在變因）
  例：「進入模擬」「動態模擬」「模擬艙」「simulation」「去模擬」
- navigate_home — 回到首頁聊天介面
  例：「回首頁」「回主畫面」「回去聊天」「home」
- open_service_faq — 打開服務 QA / 常見問題說明面板
  例：「打開 FAQ」「服務 QA」「常見問題」「打開問答」「服務說明」「show FAQ」「看 QA」
- unknown — 指令不明確、不在支援範圍、或是雜訊

## 輸出格式（必須是嚴格 JSON，不要 markdown 包裹、不要多餘文字）
{"action": "email_report" | "download_pdf" | "restart" | "navigate_simulation" | "navigate_home" | "open_service_faq" | "unknown", "message": "（口語回應，10 字內）"}

## message 規則
- 繁體中文
- 10 個字以內
- 對使用者的口語回覆，例如「好的，正在寄出」「下載中…」「重新開始」「好，去模擬」
- unknown 時回覆「沒聽清楚，再說一次」之類的提示

## 重要
- **必須只回傳 JSON，前後不要有任何解釋文字、不要包 \`\`\`**
- 不確定就回 unknown，不要硬猜`;

export async function detectVoiceIntent(transcript: string): Promise<VoiceIntent> {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return { action: "unknown", message: "沒聽到指令" };
  }

  const release = await acquireLLMSlot();
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      // 1024：MiniMax-M2.5 偶爾在 JSON 前後夾敘述／吃掉 thinking tokens，200 太緊
      // 常常整個被 stop_reason="max_tokens" 截斷成空字串，json-extractor 就回
      // 「max_tokens 可能用完了」。1024 對單行 JSON 已綽綽有餘。
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: `指令：${trimmed}` }],
    });
    const block = res.content.find((c) => c.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    if (!text.trim()) {
      // 模型一個字都沒吐 — 直接降級成 unknown，不要把堆疊的「max_tokens 可能用完了」
      // 字串噴給使用者；這個 fallback 比丟例外更有禮貌。
      return { action: "unknown", message: "沒聽清楚，再說一次" };
    }
    const parsed = extractJson<Partial<VoiceIntent>>(text, "voice-intent");
    const action = (parsed.action ?? "unknown") as VoiceAction;
    const validActions: VoiceAction[] = [
      "email_report",
      "download_pdf",
      "restart",
      "navigate_simulation",
      "navigate_home",
      "open_service_faq",
      "unknown",
    ];
    return {
      action: validActions.includes(action) ? action : "unknown",
      message: parsed.message?.toString().slice(0, 30) || fallbackMessage(action),
    };
  } finally {
    release();
  }
}

function fallbackMessage(action: VoiceAction): string {
  switch (action) {
    case "email_report":
      return "好的，正在寄出";
    case "download_pdf":
      return "下載中";
    case "restart":
      return "重新開始";
    case "navigate_simulation":
      return "進入模擬";
    case "navigate_home":
      return "回首頁";
    case "open_service_faq":
      return "打開服務 QA";
    default:
      return "沒聽清楚";
  }
}

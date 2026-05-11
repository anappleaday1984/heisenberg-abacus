import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { acquireLLMSlot, anthropic, MODEL } from "@/lib/anthropic";
import { findUserByAccount, SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  question?: string;
};

// 服務說明系統 prompt — 給 LLM 足夠 context 回答關於「海森堡的算盤」這個服務的問題。
// 內容對齊 ServiceFAQ.tsx 既有 15 筆問答的事實基礎,但保留 LLM 自由發揮空間處理未列問題。
const SYSTEM = `你是「海森堡的算盤」服務的 FAQ 助手,負責回答使用者在預設 FAQ 沒命中時的即時提問。

## 關於服務

「海森堡的算盤」是 multi-agent 虛擬人格市場調查平台,把 14 天的傳統市調壓縮到 15 分鐘。
針對金融商品(信貸 / 保險 / 信用卡)跟新類型消費品的早期概念驗證設計。

### 核心架構
- 30 位合成虛擬受訪者(persona),全部是合成資料,絕無真實客戶資料,符合個資法
- 6 位「名人 persona」(黃仁勳/伍佰/林襄/許光漢/法拉利姊/胡漢龑) — 顯影圖 CSS blur 處理
- LLM 模型:MiniMax-M2.5,透過 Anthropic SDK 相容 endpoint 呼叫
- Multi-agent pipeline:啟動者 → 觀測者 PM → 對話者 ×N → 彙整者 → 觀測者報告

### 視覺化
- PhaseTransitionMap 行為相變散佈圖(X=經濟壓力, Y=購買意願)
- DecisionSankey 三層決策桑基圖(語意脈絡 → 行為誘因 → 決策結果)
- AbacusBar 演算法盤珠(利率/月費/回饋率) + 通膨/失業外部衝擊滑桿

### 語音控制
"Hey Heisenberg" 喚醒詞,支援 7 種 action:寄報告、下載 PDF、重啟、進模擬艙、回首頁、打開服務 QA、unknown。

### 計算層(完全可解釋,無 LLM 黑箱)
- computeRadarScores:從 persona 11 欄位推 5 維雷達(經濟壓力/風險偏好/數位熟練/借貸需求/信用狀態)
- computePurchaseIntent:套產品意願公式
- applyShocks:加通膨/失業扣分

### 限制
- 早期概念驗證 sandbox,不替代上市前 GTM 規模驗證
- 同題跑兩次字面不同,但結構性結論趨勢穩定
- 彙整 AI 可能幻覺,設計上強制每結論可回溯到具體 persona

## 回答規則
- 繁體中文台灣用語
- 150-300 字,清晰直接
- 條列關鍵點(但不要全篇條列,要有敘事段落)
- 不確定時誠實說「這個我不確定,建議查看完整 README 或聯絡開發者」
- 不要編造服務沒有的功能
- 不要重複問題本身,直接給答案
- 用第一人稱「我們的服務」「海森堡的算盤」`;

export async function POST(req: Request) {
  const session = cookies().get(SESSION_COOKIE_NAME)?.value;
  const user = session ? findUserByAccount(session) : null;
  if (!user) {
    return NextResponse.json(
      { error: "請先登入後再使用 AI 問答" },
      { status: 401 }
    );
  }

  const { question } = (await req.json()) as Body;
  if (!question || !question.trim()) {
    return NextResponse.json(
      { error: "question 為必填" },
      { status: 400 }
    );
  }
  if (question.length > 500) {
    return NextResponse.json(
      { error: "問題太長,請壓在 500 字內" },
      { status: 400 }
    );
  }

  const release = await acquireLLMSlot();
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: question.trim() }],
    });
    const block = res.content.find((c) => c.type === "text");
    const answer = block && block.type === "text" ? block.text.trim() : "";
    if (!answer) {
      return NextResponse.json(
        { error: "AI 沒有回應內容,請改換問法" },
        { status: 502 }
      );
    }
    return NextResponse.json({ answer, model: MODEL });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  } finally {
    release();
  }
}

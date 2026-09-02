# 兩件專利之系統架構圖

> 對應兩份技術揭露書，各一張可獨立成立（standalone）的系統架構圖，供專利代理人擬圖式（drawings）參考。
> 兩圖以 Mermaid 撰寫，GitHub / VSCode preview 直接渲染；要出 PNG 可用 `npm run diagrams` 的同款 `@mermaid-js/mermaid-cli`。
>
> - **發明 A — 基於虛擬數位分身之自動化市場調查系統及方法**（[invention-A-pipeline.html](invention-A-pipeline.html)）
> - **發明 B — 互動式決策模擬與外部衝擊預測之解耦架構**（[invention-B-simulation.html](invention-B-simulation.html)）
>
> 兩件發明的分界即「蒸餾邊界」：A 產出每位虛擬數位分身的文字答案與結構欄位，B 把它蒸餾為數值化人格狀態後做決定性即時重算。整合全景見 [../architecture.md §1.5](../architecture.md)。

---

## 發明 A — 自動化市場調查管線（端到端資料流）

**主張標的**：把市場調查拆解為「啟動判斷 → 量化規劃 → 平行合成訪談 → 證據彙總 → 決策報告」五道由不同 system prompt 約束的代理人階段；階段間以原始產品規格上下文（productContext）串接以避免數字失真；並以單通捆綁式 JSON、全域併發節流、強健 JSON 復原等機制，使「多受訪者 × 多題」的大量模型呼叫在個人級速率限制下仍能可靠完成。

```mermaid
flowchart TB
  U["使用者（金融商品 PM / 研究員）<br/>自然語言研究命題（含具體產品規格）"]

  subgraph S0["階段 0 — 入口層（模型介入前）"]
    direction TB
    Auth["身分驗證：HttpOnly cookie<br/>同時上線 ≤ 3 人，閒置 1hr 釋放"]
    SSE["SSE ReadableStream<br/>逐事件 data: {json}"]
    Zh["出口簡→繁轉換 toTraditional()"]
    Log["串流結束寫日誌（耗時/受訪者數/摘要）"]
  end

  subgraph Throttle["全域節流層 — lib/anthropic.ts（所有階段共用，唯一節流點）"]
    direction LR
    Sem["Semaphore（預設 c=6，可動態縮放）"]
    Retry["429 / 5xx / 網路錯誤<br/>exponential backoff + full jitter（≤8 次）"]
  end

  subgraph Pipe["主訪談管線 — lib/orchestrator.ts（async generator，逐 yield StreamEvent）"]
    direction TB
    A1["① 啟動者 Entry（LLM#1，串流，不重試）<br/>判斷 READY / CLARIFY；偏向放行"]
    A2["② 觀測者·規劃 Planner（LLM#2，adaptive thinking，JSON）<br/>產出 4–6 道量化題組 {summary, questions[], scopeNote}"]
    Intro["階段 2.5 personas_intro<br/>人格顯影 + 產品類型自動推斷"]
    A3["③ 對話者 Persona × N（LLM#3×N，併發）<br/>bundled JSON 一通答 N 題；失敗退回逐題<br/>每位完成即時 yield persona_partial"]
    A4["④ 彙總者 Summary（LLM#4，adaptive thinking，JSON）<br/>共識/分歧/量化/風險 + KPI"]
    A5["⑤ 觀測者·報告 Report（LLM#5，adaptive thinking，JSON）<br/>彙整上游全部 → 完整決策報告"]
    A1 -->|"ready=true"| A2 --> Intro --> A3 --> A4 --> A5
    A1 -.->|"ready=false → complete，等補充"| Uend([本回合結束])
  end

  Spec[["規格保真：原始 userMessage 一路透傳<br/>planSurvey / askPersona / summarize / report 同一份 productContext<br/>禁止偷換單位（年↔月利率）、丟棄額度、抹除具體數字"]]

  JSONrec[["強健 JSON 復原 extractJson + json-retry<br/>fenced block 解析 / 截斷防護 / 長度校驗"]]

  subgraph Out["階段 6 — 輸出層"]
    direction LR
    PDF["PDF / PNG（jspdf + html2canvas）"]
    Mail["電郵（nodemailer / SMTP）"]
    Voice["語音控制（voice-intent agent → 7 動作）"]
    QA["訪談後問答（query agent，含 [CLARIFY] 分流）"]
  end

  Aux[["離線擴池：受訪者生成 Generator（LLM）<br/>依描述批次擴充合成受訪者池"]]
  LLM[("MiniMax-M2.5<br/>@anthropic-ai/sdk 相容端點<br/>（與供應商無關，可替換）")]
  Store[("合成受訪者池 data/personas.json<br/>零真實個資")]

  U --> Auth --> SSE --> Pipe
  Pipe -. "每個 LLM call 包在 callLLM / acquireLLMSlot" .-> Throttle
  Throttle <--> LLM
  A2 -. 受規格保真約束 .- Spec
  A3 -. 受規格保真約束 .- Spec
  A3 -. 輸出走 .- JSONrec
  A2 -. 輸出走 .- JSONrec
  A4 -. 輸出走 .- JSONrec
  Store -. 種子人格 .-> A3
  Aux -. 寫回 .-> Store
  A5 --> Out
  Pipe --> Zh --> Log
  A4 -. "personas_qa 逐位問答全集" .-> QA

  classDef llm fill:#1f4e79,stroke:#9cc3e6,color:#fff
  classDef guard fill:#5a3e1b,stroke:#f0d9b5,color:#fff
  classDef store fill:#3a2a4a,stroke:#c9a8e0,color:#fff
  class A1,A2,A3,A4,A5,LLM,Aux llm
  class Spec,JSONrec,Throttle guard
  class Store store
```

**圖中三個可專利機制（以暖色標出）**：

| 機制 | 解決的問題 | 實作 |
|---|---|---|
| 全域併發節流 + 退避 | 個人級 rate limit 下，30 受訪者並行不踩爆 429 | `lib/anthropic.ts` Semaphore + jitter backoff |
| 規格保真上下文串接 | 中間摘要造成數字 / 單位失真 | 原始 `userMessage` 透傳四個階段 |
| 單通捆綁 JSON + 強健復原 | 150 通呼叫的瓶頸；模型 JSON 不穩 | bundled `{answers[]}` + `extractJson` + 逐題 fallback |

---

## 發明 B — 互動式決策模擬與外部衝擊預測（訪談 / 模擬解耦）

**主張標的**：把不可重現、高延遲的 LLM 訪談文字，一次性蒸餾為可被決定性方程式即時重算的數值化人格狀態，使下游所有 what-if 參數探索得以「零邊際模型成本、完全可重現、即時連動多視圖」進行，並以共用的外部衝擊投影函式使所有面板的臨界點一致地偏移。

```mermaid
flowchart TB
  subgraph Once["一次性層（由發明 A 完成，有 LLM、高延遲、不可重現）"]
    direction LR
    Ans["每位受訪者文字答案 answers[]"]
    Fields["受訪者結構欄位<br/>年收入 / 家庭 / 資產與變故 / 年齡 / 性格"]
  end

  Distill{{"蒸餾邊界（純函式，無 LLM，無副作用）<br/>computeRadarScores(persona) →<br/>五維分數：經濟壓力 · 風險偏好 · 數位熟練 · 借貸需求 · 信用狀態<br/>＝ 數值基底 +（年齡項）+ 關鍵字命中加減 → clamp(0,100)"}}
  Cache[("數值化人格狀態（cache）<br/>sweep / 拖滑桿皆不重算、不再打模型")]

  Once --> Distill --> Cache

  subgraph RT["決定性即時重算層（本發明；毫秒級、零模型成本、可重現）"]
    direction TB

    subgraph Inputs["使用者即時輸入"]
      direction LR
      Beads["算盤珠 params（依產品類型綁定）<br/>信貸=年利率 / 保險=月費 / 信用卡=回饋率 / 開放式=情境壓力"]
      Shocks["外部衝擊滑桿（共用）<br/>通膨 0–10% · 失業 2–15%<br/>預設 {3, 4} ≈ 2026 台灣量級"]
    end

    Bias["五維共用基底 computeIntentBias<br/>（中性=0，範圍 ±40；四題型共用）"]
    Base["基底意願 computePurchaseIntent（信貸/保險/信用卡）<br/>/ computeOpenIntent（開放式）<br/>＝ 共用基底 + 中性錨點 + 專屬驅動 + 門檻/交互非線性項"]
    Shock["外部衝擊投影 applyShocks（散佈圖/桑基/CLV 共用）<br/>不改寫基底，於 baseIntent 上扣分<br/>通膨打高壓族、失業打『信用差×高壓』雙弱族"]

    Bias --> Base
    Beads --> Base --> Shock
    Shocks --> Shock
  end

  Cache --> Bias

  subgraph Views["多視圖（臨界點隨同一份 shocks 一致偏移）"]
    direction LR
    Scatter["相變散佈圖<br/>X=經濟壓力, Y=intent<br/>臨界線 60 願意 / 40 觀望 / 拒絕"]
    Sankey["三層決策桑基圖（buildThreeLayerFlows）<br/>① 語意脈絡桶(8+fallback)<br/>② 行為誘因桶(5+fallback)<br/>③ 決策桶(願意/觀望/拒絕)<br/>每層單一主桶分類、流量守恆"]
  end

  Shock -->|"intent"| Scatter
  Shock -->|"decisionFn = decisionFromIntent(intent)"| Sankey

  Ctx[["React Context product-params-context.tsx<br/>把 params + shocks 共享給所有面板<br/>→ 拖一次滑桿，多視圖同步重繪"]]
  Ctx -. 驅動 .-> Inputs
  Ctx -. 連動 .-> Views

  classDef llm fill:#7a2e2e,stroke:#f0b5b5,color:#fff
  classDef pure fill:#1e4631,stroke:#9ce0b5,color:#fff
  classDef store fill:#3a2a4a,stroke:#c9a8e0,color:#fff
  class Once llm
  class Distill,RT,Views pure
  class Cache store
```

**圖的閱讀重點**：

- **紅色 = 有 LLM（只跑一次）**，**綠色 = 純函式（每次拖滑桿重跑）**。可專利核心就是把這兩種成本特性用「蒸餾邊界」一刀切開。
- **共用基底 `computeIntentBias`**：四種題型（信貸/保險/信用卡/開放式）先取同一份五維偏移，再各自疊中性錨點與專屬驅動 → 任一題型（含無金融關鍵字的開放式）都以完整五維人格計算。
- **共用衝擊投影 `applyShocks`**：散佈圖、桑基圖、CLV 套同一個函式，所以同一份 `{通膨, 失業}` 設定下，所有視圖的臨界點**一致偏移**——這是「多視圖即時連動」主張的技術根據。
- **純函式 + cache + clamp(0,100)**：加性可分解、無副作用、輸出夾限 → sweep 成本低、重現性 100%、視覺穩定。

> 性質聲明：B 的意願 / 衝擊方程式為 **heuristic 行為模型**（數量級對、單調性對、相對排序對），供決策者看 trade-off 形狀與相變臨界點，非精算數字。專利標的為「建構方法論 + 即時重算架構」，非任何特定係數之精確值。

---

## 兩圖如何銜接（一句話）

發明 A 圖右下角的「合成受訪者池 + 每位文字答案」＝發明 B 圖左上角的「一次性層」輸入；中間那道 `computeRadarScores` 蒸餾邊界，就是兩件專利的法律與技術分水嶺。

# 海森堡的算盤 · 人類行為觀測站

> Multi-agent 虛擬人格市場調查平台 — 用合成的虛擬受訪者群在沙盒裡跑市調，**14 天 → 15 分鐘**

針對金融商品（信貸 / 保險 / 信用卡）跟新類型消費品的早期概念驗證設計，把「百萬級情緒語義」抽象成可對話的疊加態人格 Agent，讓 PM 在不接觸真實客戶資料的前提下，幾分鐘內取得結構化決策報告。

---

## 設計概念

| 痛點 | 解法 |
|---|---|
| 真實客戶數據受個資法保護，取得耗時 | 合成虛擬受訪者，差分隱私、零真實資料 |
| 傳統市調樣本量不足 | 平行訪談 N 位 LLM 角色（目前 demo 規模 10-50 位）|
| 概念驗證週期長、成本高 | 一次 chat 約 60-90 秒、邊際成本趨近於零 |

---

## Multi-Agent Pipeline

```
使用者輸入問題
       ↓
┌─ 啟動者 (entry) ────────┐
│  接需求、判斷是否啟動    │  ← LLM Agent #1
└────────────┬────────────┘
             ↓
┌─ 觀測者 規劃調查 (pm) ───┐
│  生成 4-6 個訪談問題     │  ← LLM Agent #2 (JSON output)
└────────────┬────────────┘
             ↓
       (人格顯影：散佈圖)
             ↓
┌─ 對話者 ×N (persona) ────┐
│  每位 N 位受訪者 1 通     │  ← LLM Agent #3 ×N
│  bundled JSON 一通 N 題   │  (concurrency = LLM_MAX_CONCURRENCY，預設 6)
│  失敗自動退回逐題模式      │
└────────────┬────────────┘
             ↓
       (決策路徑：桑基圖)
             ↓
┌─ 彙總者 (summary) ──────┐
│  歸納共識/分歧/風險       │  ← LLM Agent #4 (JSON output)
│  KPI + 群體支持度         │
└────────────┬────────────┘
             ↓
┌─ 觀測者 回報結果 (pm) ───┐
│  完整決策報告             │  ← LLM Agent #5 (JSON output)
│  含問題 / 發現 / 建議     │
└────────────┬────────────┘
             ↓
        PDF / PNG 下載
```

---

## 視覺化呈現

| Component | 內容 |
|---|---|
| **PipelineStatus** | 5 階段進度條，當前階段脈動高亮（啟動者 / 規劃 / 訪談 / 彙集 / 回報）|
| **PhaseTransitionMap** | 行為相變散佈圖；X=經濟壓力、Y=購買意願；**算盤滑桿** + **通膨/失業外部衝擊** 即時調整參數，受訪者粒子動態坍縮 |
| **DecisionSankey** | 三層決策桑基圖；**語意脈絡 → 行為誘因 → 決策**（願意/觀望/拒絕）；中間層揭示動機差異（省錢 vs 便利 vs 安全感），ribbon 漸變色從出發節點漸層到目的節點；隨算盤 + 衝擊同步重畫 |
| **AbacusBar** | 底部 sticky 控制條：左邊主算盤珠（利率 / 月費 / 回饋率），右邊兩條外部衝擊滑桿（通膨 / 失業），全區面板的臨界點同步偏移 |
| **SimulationLab** | 環境壓力模擬艙獨立頁（`/simulation`）；上方雙欄並排（行為相變 / 三層桑基），下方 sticky AbacusBar 全寬控制 |
| **PersonaQAExplorer** | Q&A 探索器；一題一題呈現 + 三色受訪者氣泡 + 翻頁按鈕（看下一題 / 換 3 位 / 看洞察報告）|
| **SummaryCard** | 一頁式可下載 PNG 圖卡：Headline + Key Takeaway + KPI 卡 + 族群 bar chart + 4 區塊洞察 |
| **ReportCard** | 完整決策報告：研究命題、執行摘要、重點發現（含 metric）、族群比較表、受訪者背景表、行動建議（priority 分級）+ PDF / PNG 下載 |

---

## Tech Stack

- **Next.js 14**（App Router、SSE streaming）+ **TypeScript**
- **Tailwind CSS** + 純 SVG（PhaseMap / Sankey / Radar 全自製）
- **Anthropic SDK** ([@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript)) 指向 MiniMax 相容 endpoint
- **MiniMax-M2.5** as LLM
- **html2canvas** + **jspdf** — PNG / PDF 匯出
- **opencc-js** — 簡體→繁體後端轉換（雙層保險）
- **react-markdown** — 報告 markdown 渲染
- **HttpOnly cookie** auth（無外部 DB）+ JSON file storage

---

## 快速啟動

### 前置條件
- Node.js 18+
- 一組 [MiniMax-M2.5](https://api.minimax.io) API key（或任何 Anthropic SDK 相容 endpoint）

### Setup

```bash
git clone https://github.com/anappleaday1984/heisenberg-abacus.git
cd heisenberg-abacus
npm install

cp .env.local.example .env.local
# 編輯 .env.local，設定：
#   - MINIMAX_API_KEY        你的 MiniMax 金鑰
#   - AUTH_USERS             登入帳號 JSON array（包含密碼）
#   - LLM_MAX_CONCURRENCY    （選填，預設 6）全域 LLM 並行上限
#   - PERSONA_MAX_PARALLEL   （選填，預設 = personas.length）persona worker 數

npm run dev
# http://localhost:3000
```

### 登入帳號

帳號 / 密碼 / 角色 全部設定在 `.env.local` 的 **`AUTH_USERS`** 環境變數（JSON array），範本見 `.env.local.example`。**密碼不入原始碼、不上 git**。

預設提供 2 個角色：
- 1 位 `admin`（管理員 — 可進後台、編輯受訪者）
- 1 位 `member`（成員 — 一般使用）

要新增 / 換密碼，直接改 `AUTH_USERS` 即可，重啟 dev server 生效。

> ⚠️ Demo 簡化版：環境變數內仍是明碼，cookie 也未簽章。Production 必須改 bcrypt + JWT。

---

## 專案結構

```
.
├── app/
│   ├── api/
│   │   ├── auth/{login,logout,me}     # 登入流程 + 同時上線人數限制
│   │   ├── chat/route.ts              # SSE 串流主端點 (orchestrate)
│   │   └── personas/                  # CRUD + AI 生成 + HackMD 匯入 + Markdown 匯出
│   ├── admin/page.tsx                 # 後台：受訪者管理 + AI 生成 + HackMD 同步
│   ├── layout.tsx + page.tsx + globals.css
│
├── components/
│   ├── ChatInterface.tsx              # 主對話介面（事件分流）
│   ├── PipelineStatus.tsx             # 5 階段進度欄
│   ├── PhaseTransitionMap.tsx         # 散佈圖 + 算盤滑桿
│   ├── DecisionSankey.tsx             # 桑基圖（依算盤即時更新）
│   ├── PersonaQAExplorer.tsx          # Q&A 翻頁瀏覽器
│   ├── SummaryCard.tsx                # 洞察圖卡（PNG 下載）
│   ├── ReportCard.tsx                 # 完整報告（PDF / PNG 下載）
│   ├── AuthForm.tsx + AuthGate.tsx + LoginButton.tsx  # 登入系統
│   ├── PersonaSummaryTable.tsx + PersonaEditor.tsx + PersonaGenerator.tsx
│   ├── HighlightedText.tsx + AgentBadge.tsx + MessageBubble.tsx
│
├── lib/
│   ├── orchestrator.ts                # Pipeline 主排程，串 productContext 到下游
│   ├── anthropic.ts                   # SDK client + 全域 semaphore + 429 retry
│   ├── auth.ts                        # 帳號 + 同時上線追蹤
│   ├── logger.ts                      # 寫 z_wth_log.md
│   ├── personas-store.ts              # JSON 檔讀寫 + HackMD parser + Markdown 匯出
│   ├── persona-scores.ts              # 五維啟發式評分 + 購買意願公式 (信貸/保險/信用卡)
│   ├── persona-flows.ts               # 關鍵字桶 + 行為誘因桶 + 決策桶 + 三層 Sankey flow builder
│   ├── persona-projections.ts         # 外部衝擊 (通膨/失業) 套用,提供 applyShocks 共用工具
│   ├── celebrity-ids.ts               # 名人 persona ID 集合 (portrait 模糊處理用)
│   ├── product-params-context.tsx     # React Context：算盤參數 + shocks 共享
│   └── agents/
│       ├── types.ts                   # SSE event types
│       ├── shared-rules.ts            # 共用語言規定 (繁中、不洩漏 agent 名稱)
│       ├── json-extractor.ts          # 強健 JSON 撈取 (4 candidates × 6 修復策略)
│       ├── zh-convert.ts              # 簡→繁兜底
│       ├── entry.ts                   # 啟動者 agent
│       ├── pm.ts                      # 觀測者 agent (規劃 + 報告)
│       ├── persona.ts                 # 對話者 agent — bundled JSON / sequential fallback
│       ├── persona-generator.ts       # AI 生成新受訪者
│       ├── summary.ts                 # 彙總者 agent (JSON output)
│       └── personas-data.ts           # 預設 10 位種子受訪者
│
├── app/api/benchmark/route.ts         # 速率限制 benchmark API
├── scripts/benchmark-rate.mts         # 速率限制 benchmark CLI
├── docs/benchmark-rate-2026-05-08.md  # 30×5 並行度實測報告
│
└── data/                              # ⚠️ runtime state，不上 git
    ├── personas.json                  # 受訪者池
    ├── auth-log.json                  # 登入歷史
    └── active-sessions.json           # 當前在線
```

---

## 關鍵設計決策

### 1. **JSON-first agent output**

觀測者 / 彙總者 / 觀測者報告全部回傳 strict JSON（包在 ` ```json fence`）。前端用結構化資料 render，不靠 markdown 解析也不會被 model 自由發揮的描述破壞。

### 2. **強健 JSON 撈取**

`lib/agents/json-extractor.ts` 應對 LLM 常見的 broken JSON：
- 4 種 candidate 抽取（json fence / 任意 fence / `{...}` / `[...]`）
- 6 種修復策略（trailing comma、彎引號、字面換行跳脫、組合）
- 每個 candidate 試 6 次 = 最多 24 次嘗試
- 失敗時把完整原文 log 到 server console

### 3. **同時上線限制 = 3 人**

`lib/auth.ts` 用 `data/active-sessions.json` 追蹤；超過 3 人不同帳號回 HTTP 429；inactivity 1 小時自動釋放 slot；同帳號重登只 refresh 不算多人。

### 4. **全域 LLM 限流 + 429 retry**

[lib/anthropic.ts](lib/anthropic.ts) 蓋一層全域 semaphore（`LLM_MAX_CONCURRENCY`，預設 6），所有 6 位 agent 共用，**這是唯一的節流點**。429 / 5xx 自動 exp-backoff + jitter retry（base 2s、最多 8 次）。

實測（30 受訪者 × 5 題、bundled 模式、c=6）：**0 個 429、wall time 79s**（之前逐題模式同條件 35 個 429、wall time 196s 還只 90% 完成）。詳見 [docs/benchmark-rate-2026-05-08.md](docs/benchmark-rate-2026-05-08.md)。

### 5. **對話者 bundled JSON 輸出**

每位受訪者只打 **1 通 LLM call**（不是 5 通），LLM 一次吐出 `{"answers":[...]}` 陣列回 N 題。30 受訪者場景的 LLM call 從 150 砍到 30，端到端時間從 **4.7 min 縮到 2.3 min**。

JSON parse 失敗或答案數量不對自動 fallback 到逐題模式（[lib/agents/persona.ts](lib/agents/persona.ts) `askPersonaSequential`）— bundle + fallback 雙保險，demo 100% 完成率。

### 6. **產品規格 productContext 注入**

使用者原始 prompt（含「年利率 6.88%」這類具體規格）會被 [orchestrator.ts](lib/orchestrator.ts) 串給 plan / persona / summarize / report 四個 agent；prompt 加「規格保真規則」明令禁止換單位（年利率 ≠ 月利率），避免 LLM 憑印象答常識數字、報告引用錯誤的規格。

### 7. **三層繁體中文保險**

1. 每個 agent 的 system prompt 開頭引用 `LANG_RULE`，明列禁用字 + 台灣用語
2. `opencc-js` 在 server SSE 出口做 `cn → tw` 轉換（包含台灣慣用詞）
3. UI 端 client component 二次保險

---

## 已知限制

| 項目 | 說明 |
|---|---|
| **MiniMax 個人 plan rate limit** | 已用全域 semaphore + bundled JSON + retry 規避（30 受訪者場景實測 0 個 429）；但若同時多訪客啟動分析，後續排隊會延長等候時間，需付費方案才能正面解決 |
| **JSON 檔案 storage** | `data/*.json` 用 `fs.writeFileSync`，serverless 平台（Vercel）不可用，需 SQLite/PostgreSQL/KV |
| **Cookie + 帳號 = session** | 無 JWT 簽章，任何人改 cookie 就能假冒帳號（demo 用 OK） |
| **同一個 chat 過程改受訪者** | 不會即時生效，下個 chat 才用新版 |
| **一次 chat 不能取消** | 觀眾按下「送出」就要等 1-3 分鐘 |

---

## Demo 流程建議

1. 開 `http://localhost:3000` → 用 `.env.local` 內的管理員帳號登入
2. 點任一個產品範例卡片（💰 微型信貸 / 🛡 保險 / 💳 信用卡）
3. 觀察 pipeline 5 階段進度條依序高亮
4. **行為相變散佈圖**出現後 → 拖拉算盤滑桿，看粒子重新坍縮
5. **桑基圖**出現後 → 滑鼠 hover 絲帶看哪些受訪者落在該路徑
6. **Q&A Explorer** → 翻頁瀏覽不同題目 / 不同代表的回答
7. 點「📊 看洞察報告」→ 同時展開 SummaryCard + ReportCard
8. 點「⬇ 下載完整報告 (PDF)」→ 拿走完整 A4 報告檔

---

## License

Hackathon demo project — 內部使用。

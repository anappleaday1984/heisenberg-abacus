# 海森堡的算盤 · 系統架構說明

> 給 hackathon 評審 / 內部測試使用。所有圖以 Mermaid 撰寫，GitHub 與 VSCode preview 直接渲染。

---

## 0. 一句話總覽

> 一個 **multi-agent 虛擬受訪者市調平台** — 使用者輸入產品概念，後端起 5 顆 LLM agent (entry → pm → persona × N → summary → pm-report) 並行訪談 10+ 位虛擬人設，產出量化散佈圖、桑基決策流向圖、與結構化洞察報告。

---

## 1. 系統架構（高層）

```mermaid
flowchart LR
  subgraph Client["瀏覽器（Next.js App Router）"]
    direction TB
    U[使用者] --> Pages
    Pages["/ &nbsp;&nbsp; /simulation &nbsp;&nbsp; /admin"]
    Pages --> Ctx[PersonaSession + ProductParams Context]
    Ctx --> LS[(localStorage)]
  end

  subgraph Server["Next.js Server / Route Handlers"]
    direction TB
    AuthAPI["/api/auth/*"]
    ChatAPI["/api/chat<br/>/api/chat/query"]
    PersonasAPI["/api/personas/*"]
    Orch[orchestrator.ts]
    Agents{{Agents<br/>entry · pm · persona · summary · query}}
    Store[(data/personas.json)]
    ChatAPI --> Orch
    Orch --> Agents
    PersonasAPI --> Store
    Agents -.讀.-> Store
  end

  subgraph External["外部服務"]
    LLM["MiniMax API<br/>(Anthropic SDK 相容)<br/>MiniMax-M2.5"]
    HackMD["HackMD<br/>人設來源"]
  end

  Client -- "fetch / SSE stream" --> Server
  Agents -- "messages.stream()" --> LLM
  PersonasAPI -- "import" --> HackMD
```

**關鍵設計點**

| 元件 | 技術 | 為什麼 |
|---|---|---|
| Next.js 14 App Router | React 18 + RSC | 客戶端多頁 + server-side streaming SSE 一站搞定 |
| MiniMax API（走 Anthropic SDK）| `@anthropic-ai/sdk` `baseURL=https://api.minimax.io/anthropic` | 直接相容 SDK、token 計價友善 |
| Persona JSON file store | `data/personas.json` | Hackathon 簡化：免 DB，admin UI 直接讀寫 |
| localStorage 持久化 | `wth.persona-session.v3` | 跨路由 + 重整保留 chat、stage、personas、qaEntries |
| Cookie session auth | `lib/auth.ts` | 帳密寫在 `AUTH_USERS` env，避免 hardcode |

---

## 2. Multi-agent 序列圖

> 「跑一次完整訪談」的時間順序，含每個 agent 在 SSE stream 上的事件。

```mermaid
sequenceDiagram
  autonumber
  actor U as 使用者
  participant FE as ChatInterface (browser)
  participant API as POST /api/chat
  participant O as orchestrator
  participant E as entry agent
  participant P as pm agent
  participant Pa as persona agent (× N 並行)
  participant S as summary agent
  participant LLM as MiniMax API

  U->>FE: 輸入產品概念
  FE->>API: { history, message }
  API-->>FE: SSE: agent_start(entry)
  API->>O: orchestrate(history, msg)
  O->>E: runEntryAgent
  E->>LLM: messages.stream()
  LLM-->>E: text deltas
  E-->>O: ready / clarify
  O-->>FE: agent_text(entry) ...
  O-->>FE: agent_done(entry)

  alt entry == ready
    O->>P: planSurvey
    P->>LLM: messages.stream()
    P-->>O: { questions, summary }
    O-->>FE: agent_start(pm, "規劃調查")
    O-->>FE: agent_text(pm)
    O-->>FE: agent_done(pm)
    O-->>FE: personas_intro { personas, productContext }

    par N 個 persona 並行（最多 6）
      O->>Pa: askPersona(p1, questions)
      Pa->>LLM: messages.stream()
    and
      O->>Pa: askPersona(p2, questions)
      Pa->>LLM: messages.stream()
    end
    Pa-->>O: PersonaResponse[]
    O-->>FE: personas_qa { questions, entries }

    O->>S: summarize
    S->>LLM: messages.stream()
    S-->>O: SummaryData (JSON)
    O-->>FE: agent_text(summary, JSON)

    O->>P: generateReport
    P->>LLM: messages.stream()
    P-->>O: ReportData
    O-->>FE: agent_text(pm, "回報結果", JSON payload)
    O-->>FE: complete
  else entry == clarify
    O-->>FE: complete (等下一輪輸入)
  end
```

**為什麼設計成 5 顆 agent？**

- **單一職責** — 每顆 agent prompt 只專注一件事（理解需求 / 設問題 / 扮演角色 / 彙整 / 寫報告），prompt 短就少幻覺
- **可平行 fan-out** — 訪談階段每顆 persona 獨立呼叫，6 並行 + 14 受訪者大約 30-40 秒收完
- **streaming 即見即改** — SSE 把每一筆 delta 推回前端，不等整段生成完才顯示

---

## 3. 資料流（client state）

```mermaid
flowchart TB
  Layout["app/layout.tsx<br/>Providers 在這層常駐"]
  Layout --> PSC[PersonaSessionProvider]
  Layout --> PPC[ProductParamsProvider]

  subgraph SC["PersonaSessionContext.state"]
    direction TB
    M["messages: DisplayMessage[]"]
    SI["showInsights: boolean"]
    Pe["personas / qaEntries / questions / productContext"]
    St["stage / stageDetail / personaCount"]
  end

  PSC --> SC
  SC -.persist.-> LS[(localStorage<br/>wth.persona-session.v3)]
  LS -.hydrate on mount.-> SC

  PSC -.read/write.-> CI[ChatInterface]
  PSC -.read.-> SLab[SimulationLab]
  PSC -.read.-> SS[SpectrumSwitcher]

  PPC --> Pp["type: ProductType<br/>paramValue: number"]
  PPC -.read/write.-> AB[AbacusBar]
  PPC -.read.-> PTM[PhaseTransitionMap]
  PPC -.read.-> DS[DecisionSankey]

  classDef store fill:#1e293b,stroke:#94a3b8,color:#fff
  class LS store
```

**為何要 hoist 到 layout？**

- 客戶端在 `/` ↔ `/simulation` 之間切時，Next.js App Router **會 unmount page-level component**；放在 layout 的 provider 不會 unmount，state 才能延續。
- localStorage 是第二層保險：硬 reload / 換 tab 也能還原。
- Mid-pipeline 遇到中斷時，hydrate 邏輯把 stage snap 到 `complete`，避免進度條卡在中間階段。

---

## 4. 路由與 UI 元件樹

```mermaid
flowchart TD
  Root["app/layout.tsx<br/>Providers 包根"]

  subgraph R1["GET /"]
    P1[app/page.tsx]
    P1 --> AG[AuthGate]
    AG -- 未登入 --> AF[AuthForm]
    AG -- 已登入 --> CI[ChatInterface]
    CI --> Hdr[Header: 模擬艙 / 人物設定 / 重啟]
    CI --> PS[PipelineStatus 進度條]
    CI --> MB["訊息列表<br/>MessageBubble · SpectrumSwitcher · PersonaQAExplorer · SummaryCard · ReportCard · QueryResponseBubble"]
  end

  subgraph R2["GET /simulation"]
    P2[app/simulation/page.tsx]
    P2 --> SL[SimulationLab]
    SL --> PTM[PhaseTransitionMap 散佈圖]
    SL --> DS[DecisionSankey 桑基圖]
    SL --> AB[AbacusBar 算盤]
  end

  subgraph R3["GET /admin"]
    P3[app/admin/page.tsx]
    P3 --> PE["PersonaEditor / Generator / Table"]
  end

  Root --> R1
  Root --> R2
  Root --> R3
```

**頁面職責切分**

| 路由 | 主要功能 | 主要 API |
|---|---|---|
| `/` | 跑訪談、看 chat 流、查詢已收集答案 | `/api/chat`、`/api/chat/query` |
| `/simulation` | 拉算盤珠看 100 個粒子相變、桑基決策流向 | 不打 API（純前端 + context 內資料） |
| `/admin` | 受訪者 CRUD / HackMD 同步 / LLM 自動生成 | `/api/personas/*` |

---

## 5. API 端點總表

| 端點 | 方法 | 用途 | 認證 |
|---|---|---|---|
| `/api/auth/login` | POST | 帳密登入，set cookie | 否 |
| `/api/auth/logout` | POST | 清 cookie | 是 |
| `/api/auth/me` | GET | 回傳目前登入者 | 是 |
| `/api/chat` | POST | 跑完整 multi-agent 流程，SSE stream | 是 |
| `/api/chat/query` | POST | 訪談完成後對既有資料問答 | 是 |
| `/api/personas` | GET / PUT / POST / DELETE | 受訪者 CRUD | 是 |
| `/api/personas/markdown` | GET | 匯出 Markdown | 是 |
| `/api/personas/import-hackmd` | POST | 從 HackMD 拉人設 | 是 |
| `/api/personas/generate` | POST | LLM 生成新人設 | 是 |

---

## 6. 部署架構（最簡）

```mermaid
flowchart LR
  Dev[開發機] -->|git push| GH[(GitHub)]
  GH -->|deploy| V[Vercel / Node host]
  V -- env: MINIMAX_API_KEY · AUTH_USERS --> V
  V -- HTTPS --> Browser[使用者瀏覽器]
  V <-- HTTPS --> MM[MiniMax API]
  V -- fs read/write --> Disk[(./data/personas.json)]

  classDef ext fill:#0f172a,stroke:#fb7185,color:#fff
  class MM ext
```

**注意事項（給維運）**

- Vercel serverless 沒有持久 disk → personas.json 不會跨部署保留，正式環境需換 DB（建議：Supabase / Vercel KV / R2）
- `MINIMAX_API_KEY` 與 `AUTH_USERS` 都走環境變數，code 內絕對不寫死
- `/api/chat` 是 streaming 響應，host 必須支援 SSE（Vercel Edge / Node Function 都 OK，Cloudflare Workers 要用 Streams API）

---

## 7. 主要技術 stack 速查

```mermaid
mindmap
  root((海森堡的算盤))
    Frontend
      Next.js 14 App Router
      React 18 + Tailwind
      Mermaid for docs
      d3-style SVG 自製
    Backend
      Next.js Route Handlers
      orchestrator.ts (async generator)
      SSE streaming
    LLM
      MiniMax-M2.5
      @anthropic-ai/sdk
      messages.stream API
    State
      React Context × 2
      localStorage
    Auth
      Cookie session
      AUTH_USERS env
    Data
      data/personas.json (hackathon)
      HackMD import
```

---

_最後更新：本文件由 Claude (Opus 4.7) 跟著程式碼一起維護 — 改 code 時記得回來同步。_

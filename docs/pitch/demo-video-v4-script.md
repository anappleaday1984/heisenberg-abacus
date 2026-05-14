# 海森堡的算盤 · Demo Video v4 · 腳本大綱

> 總長 **6 分鐘 / 360 秒 / 24 段**。HTML 端的字幕已隱藏（`.caption { display:none }`），所有旁白文字搬到這個檔，搭配 [demo-video-v4-timeline.json](demo-video-v4-timeline.json) 的時間軸做 TTS / 對嘴生成。
>
> 對應 HTML: [demo-video-v4.html](demo-video-v4.html)。`SCRIPT_MAP[lang][id].audio / .video` 之後填生成的音檔 / mp4 路徑。

## 推薦輸出目錄

```
public/sound/v4/zh/scene{1..24}.mp3
public/sound/v4/en/scene{1..24}.mp3
public/sound/v4/zh/scene{1..24}.mp4   # talking-head（可選）
public/sound/v4/en/scene{1..24}.mp4
```

每段中文 ≈ 35-50 字、英文 ≈ 30-45 字，朗讀速度 200 字/分鐘 ≈ 10-15 秒，剛好對齊時間軸。

---

## Section 1 · 開場（0:00–0:30）

### Scene 1 · OPENING（0:00–0:12 · 12s · sceneEl=`scene-1`）
- **ZH**：量子實驗室開機，觀測者進場。
- **EN**：The quantum laboratory boots up. The observer enters.

### Scene 2 · TITLE（0:12–0:30 · 18s · sceneEl=`scene-title`）
- **ZH**：海森堡的算盤 — 把市場調查當作量子觀測，N=30 位虛擬受訪者並行作答。
- **EN**：Heisenberg's Abacus — market research as quantum observation, N=30 synthetic respondents answering in parallel.

---

## Section 2 · 登入 + 主介面（0:30–1:00）

### Scene 3 · AUTH（0:30–0:48 · 18s · sceneEl=`scene-2`）
- **ZH**：一鍵以 demo admin 進場，觀測者身份確認。
- **EN**：One-click demo admin login. Observer identity confirmed.

### Scene 4 · MAIN UI（0:48–1:00 · 12s · sceneEl=`scene-3`）
- **ZH**：主介面三張產品範例卡片，可直接點或自訂命題。
- **EN**：Three product templates on the main screen — or type any prompt of your own.

---

## Section 3 · 人物顯影（1:00–1:30）

### Scene 5 · PERSONA POOL（1:00–1:30 · 30s · sceneEl=`scene-persona-show`）
- **ZH**：平台抽樣自 60 位合成虛擬人格 — v1 外送員 30 位、v2 上班族 30 位，每個都有獨立的家庭、收入、人格五維。
- **EN**：The platform draws from 60 synthetic personas — 30 delivery riders (v1), 30 office workers (v2). Each one has its own family, income, and five-dimensional personality.
- **Visual note**：30 個 techlife 頭像在 5×6 grid 內依序 pop-in（60ms 間隔），字幕標籤於 800ms 後顯現。

---

## Section 4 · Prompt + Pipeline（1:30–2:30）

### Scene 6 · PROMPT（1:30–1:50 · 20s · sceneEl=`scene-3`）
- **ZH**：我們示範一個年費 990 元、保額 200 萬的旅遊保險信用卡，目標 30-45 歲族群。
- **EN**：We pitch a travel-insurance credit card: NT$990 per year, NT$2M coverage, targeting ages 30 to 45.

### Scene 7 · PIPELINE START（1:50–2:10 · 20s · sceneEl=`scene-4`）
- **ZH**：送出觀測，五段管線啟動 — 啟動者結構化、觀測者規劃 4-6 題訪談。
- **EN**：Submit. The five-stage pipeline lights up — the entry agent structures the brief, the PM agent designs 4 to 6 interview questions.

### Scene 8 · PIPELINE FAN（2:10–2:30 · 20s · sceneEl=`scene-4`）
- **ZH**：30 位 persona 並行 streaming 答題，concurrency 6、bundled JSON 一通 N 題。
- **EN**：30 personas answer in parallel — concurrency 6, bundled JSON, one call per persona covers every question.

---

## Section 5 · Persona Q&A（2:30–3:00）

### Scene 9 · Q&A · Q2（2:30–2:45 · 15s · sceneEl=`scene-5`）
- **ZH**：第二題保額 200 萬夠不夠 — 6 位代表立場各異，從「勉強夠」「太低」到「家庭出遊不夠」。
- **EN**：Question 2: is NT$2M coverage enough? Six voices, six positions — "barely enough", "too low", "not for family travel".

### Scene 10 · Q&A · Q3-Q4（2:45–3:00 · 15s · sceneEl=`scene-5`）
- **ZH**：翻頁繼續看 Q3 年費敏感度、Q4 競品比較 — 同樣 30 位受訪者橫向掃描。
- **EN**：Page to Q3 on annual-fee sensitivity, Q4 on competitor comparison — the same 30 respondents scanned horizontally.

---

## Section 6 · Visualizations（3:00–4:15）

### Scene 11 · PHASE MAP（3:00–3:15 · 15s · sceneEl=`scene-6`）
- **ZH**：行為相變散布圖誕生 — 30 顆粒子分布在拒絕 / 觀望 / 購買三區，KPI 同步顯示 38 / 34 / 28%。
- **EN**：The behavioural phase-transition map appears — 30 particles spread across reject, watch, buy zones; KPIs read 38 / 34 / 28%.

### Scene 12 · PHASE READ（3:15–3:25 · 10s · sceneEl=`scene-6`）
- **ZH**：Hover 任何粒子看到受訪者背景、五維分數；族群結構即時量化。
- **EN**：Hover any particle for the respondent's background and five-dimensional score. Segment structure quantified in real time.

### Scene 13 · SIM LAB（3:25–3:40 · 15s · sceneEl=`scene-7`）
- **ZH**：進模擬艙 — 算盤滑桿掌控年費 / 保額 / 回饋率三條主軸，外加通膨、失業兩個外部衝擊。
- **EN**：Enter the simulation lab — the abacus slider controls annual fee, coverage, rebate, plus inflation and unemployment shocks.

### Scene 14 · ABACUS DRAG（3:40–3:55 · 15s · sceneEl=`scene-7`）
- **ZH**：年費從 990 拉到 490，粒子重新塌縮，購買率 38% 跳到 67% — 假設驗證從兩週縮到兩秒。
- **EN**：Drag the annual fee from 990 to 490. Particles re-collapse, buy rate jumps from 38% to 67%. Hypothesis testing in two seconds.

### Scene 15 · SANKEY（3:55–4:15 · 20s · sceneEl=`scene-8`）
- **ZH**：三層決策桑基：語意脈絡 → 行為誘因 → 決策，動機差異一條條 ribbon 攤開，直接看到「保額不足 → 觀望」族群在哪。
- **EN**：A three-tier decision Sankey: semantic context → behavioural triggers → decision. Motivation differences unfold as ribbons. The "low-coverage → watch" segment is right there.

---

## Section 7 · Report（4:15–4:45）

### Scene 16 · REPORT（4:15–4:30 · 15s · sceneEl=`scene-9`）
- **ZH**：完整決策報告降下：Headline、KPI、四項關鍵發現、族群比較表、行動建議。
- **EN**：The full decision report descends: headline, KPIs, four key findings, segment comparison table, action items.

### Scene 17 · EXPORT（4:30–4:45 · 15s · sceneEl=`scene-9`）
- **ZH**：一鍵下載 PDF 或寄到信箱，或直接跳回模擬艙微調 — 交付物不再是逐字稿與簡報。
- **EN**：One click to download the PDF, email it, or jump back to the simulation lab. The deliverable is no longer a transcript or a slide deck.

---

## Section 8 · Beyond Finance · 滷肉飯餅乾（4:45–5:30）

### Scene 18 · BEYOND · PROMPT（4:45–5:00 · 15s · sceneEl=`scene-10`）
- **ZH**：不只金融商品 — 我換個題目：幫我規劃滷肉飯口味洋芋片餅乾的市調。
- **EN**：Beyond financial products — let's switch topics. Help me design a market study for a braised-pork-rice flavoured potato chip cracker.

### Scene 19 · BEYOND · SPEC（5:00–5:15 · 15s · sceneEl=`scene-10`）
- **ZH**：商品規格：跟知名滷肉飯聯名、102 克售價 49 元、香脆鹹甜醬油風味、試水溫。
- **EN**：Product spec: co-branded with a famous braised-pork-rice brand, 102g at NT$49, crispy, savoury soy-sauce flavour, testing the waters.

### Scene 20 · BEYOND · RESULT（5:15–5:30 · 15s · sceneEl=`scene-10`）
- **ZH**：30 位受訪者 87 秒給回應：試吃意願 78%、願意付 49 元 52%、期望售價 35 到 55 元、獵奇加分 11pp。
- **EN**：30 respondents, 87 seconds: 78% willing to taste, 52% accept the NT$49 price, expected price range NT$35-55, novelty adds 11 percentage points.

---

## Section 9 · 架構 + 結語（5:30–6:00）

### Scene 21 · ARCHITECTURE（5:30–5:48 · 18s · sceneEl=`scene-arch`）
- **ZH**：系統架構：Next.js 14 前端 + Anthropic SDK 串 MiniMax-M2.5，5 段管線、6 個 Claude agent 接力，全域 semaphore + bundled JSON 維持 0 個 429。
- **EN**：System architecture: Next.js 14 frontend, Anthropic SDK pointing at MiniMax-M2.5, five-stage pipeline with six Claude agents in relay, global semaphore plus bundled JSON keeps 429 errors at zero.

### Scene 22 · BEFORE / AFTER（5:48–5:53 · 5s · sceneEl=`scene-12`）
- **ZH**：把市場調查從 14 天、30-50 萬、PII 風險，壓縮成 90 秒、零真人資料、邊際成本趨近零。
- **EN**：Compress market research from 14 days, NT$300-500K budget, and PII risk — into 90 seconds, zero real-person data, near-zero marginal cost.

### Scene 23 · QUOTE（5:53–5:57 · 4s · sceneEl=`scene-12`）
- **ZH**：不再訪問消費者 — 召喚機率雲。
- **EN**：Stop interviewing consumers — summon the probability cloud.

### Scene 24 · CREDITS（5:57–6:00 · 3s · sceneEl=`scene-12`）
- **ZH**：海森堡的算盤，Built with Claude Code · MiniMax-M2.5 · Next.js 14。
- **EN**：Heisenberg's Abacus. Built with Claude Code, MiniMax-M2.5, Next.js 14.

---

## TTS / 對嘴生成備忘

1. **音檔（ElevenLabs / MiniMax TTS / OpenAI TTS）**
   - 中文建議：女聲、語速正常、台灣中文發音
   - 英文建議：中性/男聲、清晰、不要太美式
2. **對嘴影片（D-ID / HeyGen / Synthesia）**
   - Avatar：科技人類風（與站內 techlife 同調）
   - 背景：透明 / 純黑（這樣 narrator 圓形 frame 可以無縫切換）
3. **填回 HTML**
   - 在 `demo-video-v4.html` 的 `SCRIPT_MAP[lang][n]` 物件填 `audio: '/sound/v4/zh/scene1.mp3'` / `video: '/sound/v4/zh/scene1.mp4'`
   - 沒填的場景仍走 SVG fallback 對嘴 + caption 隱藏 mode

## 場景複用對照（sceneEl → script slots）

| sceneEl | 使用 slot # | 累計秒數 |
|---|---|---|
| scene-1 | 1 | 12s |
| scene-title | 2 | 18s |
| scene-2 (login) | 3 | 18s |
| scene-3 (main) | 4, 6 | 12 + 20 = 32s |
| scene-persona-show | 5 | 30s |
| scene-4 (pipeline) | 7, 8 | 20 + 20 = 40s |
| scene-5 (Q&A) | 9, 10 | 15 + 15 = 30s |
| scene-6 (phase map) | 11, 12 | 15 + 10 = 25s |
| scene-7 (abacus) | 13, 14 | 15 + 15 = 30s |
| scene-8 (sankey) | 15 | 20s |
| scene-9 (report) | 16, 17 | 15 + 15 = 30s |
| scene-10 (滷肉飯) | 18, 19, 20 | 15 + 15 + 15 = 45s |
| scene-arch | 21 | 18s |
| scene-12 (closing) | 22, 23, 24 | 5 + 4 + 3 = 12s |
| **合計** | 24 slots | **360s** ✓ |

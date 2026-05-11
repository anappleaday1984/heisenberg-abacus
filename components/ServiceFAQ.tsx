"use client";

import { useEffect, useState } from "react";
import {
  VOICE_OPEN_FAQ_EVENT,
  VOICE_OPEN_FAQ_SESSION_KEY,
} from "./VoiceControl";

/**
 * 海森堡服務 QA 面板 — 給 PM / 客戶 / 自己回顧服務細節用。
 *
 * 設計成可擴充的列表 — 之後要新增「LLM 怎麼平行」「報告怎麼產」之類的 Q&A,
 * 直接加進 FAQ_ENTRIES 即可。每筆可選 diagram 屬性塞一段 inline SVG 示意圖。
 */
type FAQEntry = {
  id: string;
  q: string;
  /** 短摘要 — 收合時顯示 */
  summary: string;
  /** 完整答覆 — 展開時顯示 */
  body: React.ReactNode;
  /** 可選示意圖 — 通常 inline SVG */
  diagram?: React.ReactNode;
  /** 搜尋詞 — body 是 JSX 無法直接搜尋,把該筆的關鍵字塞這裡讓 search 抓得到 */
  keywords?: string;
};

const FAQ_ENTRIES: FAQEntry[] = [
  {
    id: "voice-model",
    q: '當我說「Hey Heisenberg」,用的是哪一個語音模型?',
    summary:
      "嚴格說不是「一個語音模型」 — STT + Regex + LLM 三層拼出來,只有第三層的意圖判讀用到 MiniMax-M2.5 LLM。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          一句「Hey Heisenberg + 把報告寄給我」實際走過{" "}
          <span className="text-violet-300 font-semibold">四道工序</span>,每道用不同技術
          —{" "}
          <span className="text-amber-300">只有第三道才真正打 LLM API</span>,其他都是免費的瀏覽器內建能力或純前端 regex。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <div className="border border-slate-700 rounded p-2 bg-slate-900/40">
            <div className="text-slate-400 font-semibold mb-1">① 語音 → 文字 (STT)</div>
            <div className="text-slate-300">
              用瀏覽器內建{" "}
              <code className="text-cyan-300 bg-slate-950 px-1 rounded">
                Web Speech API
              </code>
              ,免費、無 LLM、即時。Chrome / Safari / Edge 支援,Firefox 不支援。
            </div>
          </div>
          <div className="border border-slate-700 rounded p-2 bg-slate-900/40">
            <div className="text-slate-400 font-semibold mb-1">② 喚醒詞偵測</div>
            <div className="text-slate-300">
              純前端 regex,涵蓋 600+ 種中英文同音變體(嘿森堡、嗨生伯格、heyzenburg 都會觸發)。
              <span className="text-slate-500">0ms 延遲 · 不耗 token</span>
            </div>
          </div>
          <div className="border border-violet-500/50 rounded p-2 bg-violet-500/10">
            <div className="text-violet-300 font-semibold mb-1">
              ③ 意圖判讀 ← 唯一用 LLM
            </div>
            <div className="text-slate-200">
              <span className="text-violet-200 font-semibold">MiniMax-M2.5</span>
              ,透過 Anthropic SDK 相容 endpoint 呼叫
              <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
                api.minimax.io/anthropic
              </code>
              。把口語指令分到 7 種 action(寄報告 / 下載 PDF / 重啟 / 進模擬艙 / 回首頁 / 打開服務 QA / unknown)。
            </div>
          </div>
          <div className="border border-slate-700 rounded p-2 bg-slate-900/40">
            <div className="text-slate-400 font-semibold mb-1">④ 動作執行</div>
            <div className="text-slate-300">
              dispatch CustomEvent / Next.js router 跳轉。
              <span className="text-slate-500">語音回覆(TTS)未實作,目前顯示文字浮窗</span>
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-slate-900/60 border border-slate-700 rounded text-xs">
          <div className="text-amber-300 font-semibold mb-1">為什麼這樣設計?</div>
          <ul className="space-y-1 text-slate-300 list-disc list-inside">
            <li>
              <strong>STT 不用 LLM</strong>: LLM-based STT 貴又慢,Web Speech API 免費 + 隱私在裝置端
            </li>
            <li>
              <strong>喚醒詞不用 LLM</strong>: regex 涵蓋 600 種同音已經夠,LLM 是過度殺雞還會耗 token
            </li>
            <li>
              <strong>意圖判讀必須用 LLM</strong>: regex 處理「我想下載報告」「download 一下」這類口語變形太脆弱;新增指令只需改 system prompt
            </li>
          </ul>
        </div>
      </div>
    ),
    diagram: <VoicePipelineDiagram />,
    keywords:
      "語音 voice STT speech recognition Web Speech API 喚醒詞 hey heisenberg 嘿森堡 regex MiniMax M2.5 LLM 意圖判讀 intent",
  },
  {
    id: "personas-origin",
    q: "30 位虛擬受訪者是怎麼來的?有用到真實客戶資料嗎?",
    summary:
      "完全是合成資料 — 從不接觸任何真實客戶,符合個資法與差分隱私。每位有 11 個欄位的人設骨幹,被當作 LLM 的「角色扮演基底」。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          受訪者池有 <span className="text-cyan-300 font-semibold">3 條來源 pipeline</span>,
          最終匯入 <code className="text-cyan-300 bg-slate-950 px-1 rounded">data/personas.json</code> 給 agents 讀。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div className="border border-slate-700 rounded p-2 bg-slate-900/40">
            <div className="text-blue-300 font-semibold mb-1">① TS Seed</div>
            <div className="text-slate-300">
              <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
                personas-data.ts
              </code>{" "}
              的 DEFAULT_PERSONAS 常數 — 11 位 baseline 角色,fresh install 自動建檔。
            </div>
          </div>
          <div className="border border-slate-700 rounded p-2 bg-slate-900/40">
            <div className="text-violet-300 font-semibold mb-1">② HackMD 同步</div>
            <div className="text-slate-300">
              「人設設定」章節在 HackMD 編輯,
              <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
                parseHackmdMarkdown()
              </code>{" "}
              解析後匯入,目前 30 位。
            </div>
          </div>
          <div className="border border-slate-700 rounded p-2 bg-slate-900/40">
            <div className="text-emerald-300 font-semibold mb-1">③ Admin 手刻</div>
            <div className="text-slate-300">
              <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
                /admin
              </code>{" "}
              頁可新增 / 編輯 / 複製 / 刪除單筆人物。
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-slate-900/60 border border-slate-700 rounded text-xs">
          <div className="text-amber-300 font-semibold mb-1">每位 persona 11 個欄位</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-300">
            <span>· id (識別碼)</span>
            <span>· archetype (原型,如「全職衝刺型」)</span>
            <span>· name (角色名)</span>
            <span>· gender / age</span>
            <span>· yearlyIncomeTWD (年收入)</span>
            <span>· incomeBreakdown (收入結構)</span>
            <span>· personality (人格特質)</span>
            <span>· family (家庭狀況)</span>
            <span>· assetsAndEvents (資產與變故)</span>
            <span>· signatureStyle (招牌講話風格)</span>
          </div>
        </div>

        <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-slate-200">
          <div className="text-rose-300 font-semibold mb-1">⚠ 6 位「名人」persona</div>
          黃仁勳、伍佰、林襄、許光漢、法拉利姊、胡漢龑 — 只供 demo 視覺加分。顯影圖經
          <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px] mx-1">
            CSS filter: blur(8px)
          </code>
          模糊處理,只保留輪廓避免 likeness 問題。
        </div>

        <p className="text-xs text-slate-400 mt-2">
          <strong>為什麼 30 位?</strong> 比傳統焦點團體 (6-8 位) 多得多,比量化問卷
          (1000+) 少,但足以浮現「共識」與「分歧」兩種訊號 — 早期概念驗證的甜蜜點。
        </p>
      </div>
    ),
    diagram: <PersonasOriginDiagram />,
    keywords:
      "受訪者 persona 合成資料 個資 隱私 差分隱私 HackMD DEFAULT_PERSONAS seed 名人 黃仁勳 伍佰 林襄 許光漢 法拉利姊 胡漢龑 模糊 blur 角色扮演",
  },
  {
    id: "time-cost",
    q: "為什麼說「14 天 → 15 分鐘」?跟真實市調比優勢在哪?",
    summary:
      "傳統市調 14 天主要是招募 / 排程 / 訪談 / 逐字稿 / 統計 — 我們把這 5 段全部砍成 0。平行訪談 + bundled JSON + 結構化輸出三件事是關鍵。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          傳統市調的時間瓶頸 <strong>不在訪談本身</strong>,而在訪談前後的人力流程。
          海森堡用 LLM 把整條 pipeline 變成自動化串接。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="border border-rose-500/30 bg-rose-500/5 rounded p-3 space-y-1">
            <div className="text-rose-300 font-bold mb-2">📅 傳統市調 (14-21 天)</div>
            <div className="flex justify-between"><span>招募受訪者</span><span className="text-slate-400">3-5 天</span></div>
            <div className="flex justify-between"><span>約訪排程</span><span className="text-slate-400">2-3 天</span></div>
            <div className="flex justify-between"><span>一對一訪談 30 位</span><span className="text-slate-400">5-7 天</span></div>
            <div className="flex justify-between"><span>逐字稿整理</span><span className="text-slate-400">2-3 天</span></div>
            <div className="flex justify-between"><span>統計分析 + 報告</span><span className="text-slate-400">2-3 天</span></div>
            <div className="border-t border-rose-500/30 pt-2 mt-2 flex justify-between font-bold">
              <span className="text-rose-200">總成本</span>
              <span className="text-rose-200">NT$ 5-20 萬</span>
            </div>
          </div>
          <div className="border border-emerald-500/30 bg-emerald-500/5 rounded p-3 space-y-1">
            <div className="text-emerald-300 font-bold mb-2">⚡ 海森堡 (90-150 秒)</div>
            <div className="flex justify-between"><span>人格池查詢</span><span className="text-slate-400">0.5 秒</span></div>
            <div className="flex justify-between"><span>觀測者 PM 出題</span><span className="text-slate-400">8-12 秒</span></div>
            <div className="flex justify-between"><span>平行訪談 30 位</span><span className="text-slate-400">60-90 秒</span></div>
            <div className="flex justify-between"><span>彙整者 summary</span><span className="text-slate-400">10-15 秒</span></div>
            <div className="flex justify-between"><span>PM 出決策報告</span><span className="text-slate-400">15-20 秒</span></div>
            <div className="border-t border-emerald-500/30 pt-2 mt-2 flex justify-between font-bold">
              <span className="text-emerald-200">總成本</span>
              <span className="text-emerald-200">NT$ 5-15</span>
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-slate-900/60 border border-slate-700 rounded text-xs">
          <div className="text-amber-300 font-semibold mb-1">關鍵技術</div>
          <ul className="space-y-1 text-slate-300 list-disc list-inside">
            <li>
              <strong>平行訪談</strong>: 30 位同時跑 (concurrency = 6),不是 sequential
            </li>
            <li>
              <strong>Bundled JSON</strong>: 一通電話內出 5 題答案,把原本 150 次 LLM call 砍到 30 次
            </li>
            <li>
              <strong>結構化輸出</strong>: agent 直接回 JSON,不用人工編碼
            </li>
            <li>
              <strong>邊際成本 ≈ 0</strong>: 同一個 PM 一天能跑 50 輪不同方案的「概念可行性快測」
            </li>
          </ul>
        </div>

        <p className="text-xs text-slate-400">
          <strong>使用場景:</strong> 早期概念驗證、訂價測試、文案 A/B、產品命名嗅探。
          <span className="text-rose-300">不取代</span>真實用戶研究 — 上市前 GTM 規模驗證仍應該用真人。
        </p>
      </div>
    ),
    diagram: <TimeComparisonDiagram />,
    keywords:
      "時間 成本 14 天 15 分鐘 90 秒 市調 焦點團體 平行訪談 concurrency bundled JSON 結構化輸出 預算 NT$ 邊際成本 GTM",
  },
  {
    id: "answer-diversity",
    q: "怎麼確保 30 位虛擬人物回答不會千篇一律?",
    summary:
      "4 層人格差異化設計 — system prompt 角色基底 + signatureStyle 講話指紋 + bundled JSON 上下文一致 + bouncer 套話過濾。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          這是合成市調最常見的質疑。海森堡的對應是「分層防線」 — 每一層都針對一種 LLM 的失敗模式。
        </p>

        <div className="space-y-2 text-xs">
          <div className="border border-blue-500/40 bg-blue-500/5 rounded p-2.5">
            <div className="text-blue-300 font-semibold mb-1">
              第 1 層 · Persona System Prompt
            </div>
            <div className="text-slate-300">
              每位 persona 的 11 個欄位整段塞進 system prompt,LLM 在這段對話內就是「他」。
              要求第一人稱、不能跳出角色解說、不能用「使用者您好」。
            </div>
          </div>
          <div className="border border-violet-500/40 bg-violet-500/5 rounded p-2.5">
            <div className="text-violet-300 font-semibold mb-1">
              第 2 層 · signatureStyle 講話指紋
            </div>
            <div className="text-slate-300">
              專給名人 / 強個性角色用的招牌語助詞 + 慣用比喻。例如:
              <span className="text-amber-300 mx-1">伍佰</span>
              的「來來來」、
              <span className="text-amber-300 mx-1">法拉利姊</span>
              的戲劇腔。system prompt 拉成獨立段落要求「每題答案都要強烈體現」。
            </div>
          </div>
          <div className="border border-emerald-500/40 bg-emerald-500/5 rounded p-2.5">
            <div className="text-emerald-300 font-semibold mb-1">
              第 3 層 · Bundled JSON 上下文一致
            </div>
            <div className="text-slate-300">
              一通 chat 出 5 題答案,人物在 5 題之間保持自洽 — 不會這題說「我有兩個小孩」、下題說「我單身」。
              失敗自動退回逐題模式作 fallback。
            </div>
          </div>
          <div className="border border-amber-500/40 bg-amber-500/5 rounded p-2.5">
            <div className="text-amber-300 font-semibold mb-1">
              第 4 層 · Bouncer 套話過濾
            </div>
            <div className="text-slate-300">
              彙整前再掃一遍把 LLM-flavor 套話(「總體而言」「整體來看」「以下是我的看法」)
              過濾掉,留下真正有人物 voice 的句子。
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-slate-900/60 border border-slate-700 rounded text-xs text-slate-300">
          <strong>誠實提醒:</strong> 不會 100% 解決 — LLM 仍有「政治正確化」、「迴避極端立場」的傾向。
          但已經比一般 ChatGPT 直接問「30 個不同的人會怎麼回答」要強很多,而且
          <span className="text-amber-300 mx-1">傳統焦點團體本來也會 group think</span>
          。
        </div>
      </div>
    ),
    diagram: <DiversityLayerDiagram />,
    keywords:
      "千篇一律 重複 多樣性 diversity system prompt signatureStyle 講話風格 bundled JSON bouncer 套話 hallucination 幻覺 group think",
  },
  {
    id: "math-explainable",
    q: "散佈圖、桑基圖上的數字是怎麼算的?是黑箱嗎?",
    summary:
      "完全可解釋 — 從 persona 11 個欄位用啟發式公式推 5 維雷達,再依產品類型套不同 intent 公式。沒有 LLM 在打分,任何一格都能追到具體加分扣分。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          這是業務 / 風控端最關心的問題。海森堡刻意把「visualization 的數字」跟「LLM 的口語答案」分開
          —{" "}
          <span className="text-amber-300">前者完全可審計</span>,
          <span className="text-cyan-300 mx-1">後者只用來做 quote 跟洞察</span>。
        </p>

        <div className="border border-slate-700 rounded p-3 bg-slate-900/40 text-xs">
          <div className="text-violet-300 font-semibold mb-2">5 維雷達分數 (0-100)</div>
          <div className="space-y-1 text-slate-300">
            <div>📉 <strong>經濟壓力</strong>: 基底 = (120 萬 - 年收) / 120 萬 × 80</div>
            <div className="ml-6 text-slate-500">+ 撫養關鍵字 +25 / 失業卡債 +15 / 包租定存 -30</div>
            <div>🎲 <strong>風險偏好</strong>: 基底 = 110 - 年齡 × 1.4 (年輕高、年長低)</div>
            <div className="ml-6 text-slate-500">+ 創業投資加密 +20 / 保守穩定 -20</div>
            <div>📱 <strong>數位熟練度</strong>: 基底 = 105 - (年齡-18) × 1.7</div>
            <div className="ml-6 text-slate-500">+ 工程師 / APP / 新創 +18 / 退休傳統 -18</div>
            <div>💰 <strong>借貸需求</strong>: 看年收級距 + 撫養 + 還債關鍵字</div>
            <div>📊 <strong>信用狀態</strong>: 看不動產 / 工程公務員 / 卡債破產關鍵字</div>
          </div>
        </div>

        <div className="border border-slate-700 rounded p-3 bg-slate-900/40 text-xs">
          <div className="text-amber-300 font-semibold mb-2">
            意願度公式 (信貸範例)
          </div>
          <div className="text-slate-300 font-mono text-[11px] bg-slate-950 p-2 rounded">
            intent = loanNeed × 0.4 + riskPref × 0.3<br />
            &nbsp; + (5 - 利率%) × 3 &nbsp;&nbsp;&nbsp;// 利率敏感<br />
            &nbsp; + (creditStatus - 50) × 0.18 &nbsp;// 信用<br />
            &nbsp; ± 經濟壓力曲線 (50-80 +6, &gt;80 -15)<br />
            &nbsp; + (digitalFluency - 50) × 0.05
          </div>
          <p className="mt-1 text-slate-400">
            保險 / 信用卡公式類似但係數不同。完整列表在
            <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px] mx-1">
              lib/persona-scores.ts
            </code>
          </p>
        </div>

        <div className="border border-slate-700 rounded p-3 bg-slate-900/40 text-xs">
          <div className="text-rose-300 font-semibold mb-2">外部衝擊扣分 (applyShocks)</div>
          <div className="text-slate-300 space-y-1">
            <div>
              <strong>通膨</strong>: 經濟壓力 &gt; 40 的人,每 1% 通膨扣 0.45 × (壓力 - 40)
            </div>
            <div>
              <strong>失業</strong>: 信用 &lt; 50 + 經濟壓力高的人扣最多
            </div>
          </div>
        </div>

        <div className="border border-slate-700 rounded p-3 bg-slate-900/40 text-xs">
          <div className="text-pink-300 font-semibold mb-2">
            桑基圖中間層「行為誘因」分類
          </div>
          <div className="text-slate-300">
            INCENTIVE_BUCKETS 5 類各自有關鍵字字典:
            <span className="text-amber-300 mx-1">剛性節流</span>(油錢/月繳/撐不住)
            ·{" "}
            <span className="text-blue-300 mx-1">安全感建構</span>(保障/應急/家人)
            ·{" "}
            <span className="text-emerald-300 mx-1">機會型成長</span>(投資/副業/報酬)
            ·{" "}
            <span className="text-violet-300 mx-1">便利速度</span>(APP/快/30秒)
            ·{" "}
            <span className="text-rose-300 mx-1">風險規避</span>(怕/詐騙/條款)
            。命中最多者為主誘因。
          </div>
        </div>
      </div>
    ),
    diagram: <MathExplainabilityDiagram />,
    keywords:
      "公式 演算法 黑箱 explainable 可解釋 雷達 radar 5 維 經濟壓力 風險偏好 數位熟練 借貸需求 信用狀態 意願度 intent applyShocks 通膨 失業 桑基 行為誘因 incentive 剛性節流 安全感 機會 便利 風險規避",
  },
  {
    id: "name-origin",
    q: "「海森堡的算盤」這個名字什麼意思?跟物理學有關?",
    summary:
      "海森堡 = 量子力學「不確定原理 + 觀測者效應」。30 位虛擬客群在被問之前是疊加態,你問問題 = 觀測動作,他們的回答就坍縮成具體意見。算盤 = 商品參數,撥動就改變觀測場域。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          這個名字是整套服務的核心 metaphor — 不只是行銷文案,而是技術設計的指引。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="border border-cyan-500/40 bg-cyan-500/5 rounded p-3">
            <div className="text-cyan-300 font-semibold mb-1">
              🌀 海森堡 · 不確定原理
            </div>
            <div className="text-slate-300 space-y-1">
              <p>Werner Heisenberg (1901-1976) 提出量子力學的兩個關鍵概念:</p>
              <ul className="list-disc list-inside text-slate-400">
                <li><strong className="text-slate-200">不確定原理</strong>:粒子的位置與動量不能同時精確測量</li>
                <li><strong className="text-slate-200">觀測者效應</strong>:測量行為本身會「坍縮」量子疊加態到具體值</li>
              </ul>
            </div>
          </div>
          <div className="border border-violet-500/40 bg-violet-500/5 rounded p-3">
            <div className="text-violet-300 font-semibold mb-1">
              🧮 算盤 · 可調觀測場
            </div>
            <div className="text-slate-300 space-y-1">
              <p>算盤珠 = 商品參數的具象化:</p>
              <ul className="list-disc list-inside text-slate-400">
                <li>信貸 → 撥動<strong className="text-slate-200">年利率</strong></li>
                <li>保險 → 撥動<strong className="text-slate-200">月費</strong></li>
                <li>信用卡 → 撥動<strong className="text-slate-200">回饋率</strong></li>
                <li>+ 通膨 × 失業 兩條<strong className="text-slate-200">外部變因珠</strong></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border border-amber-500/40 bg-amber-500/5 rounded p-3 text-xs space-y-2">
          <div className="text-amber-300 font-semibold">對應到產品設計</div>
          <div className="text-slate-300">
            <strong className="text-amber-200">問問題之前:</strong> 30 位 persona 處於「疊加態」 —
            他們同時有很多種可能的回答,你不知道。
          </div>
          <div className="text-slate-300">
            <strong className="text-amber-200">問問題瞬間:</strong> LLM 把 11 個欄位 + 你的問題餵進去,
            「坍縮」成具體的回答 — 「我會買」「我猶豫」「我拒絕」。
          </div>
          <div className="text-slate-300">
            <strong className="text-amber-200">撥算盤珠:</strong> 改變利率 / 月費 / 通膨,觀測場改變,
            30 顆粒子在散佈圖上重新坍縮位置 — 你看到「相變」。
          </div>
        </div>

        <p className="text-xs text-slate-400 mt-2">
          <strong>哲學上的對應:</strong> 真實用戶研究的「觀察者偏誤」也類似 — 你訪問一個人的瞬間,
          你的問題框架就改變了他的回答。海森堡的算盤把這個現象明牌:
          <span className="text-amber-300 mx-1">不假裝中立</span>,而是讓 PM
          看到「不同觀測場下,客群會怎麼分布」。
        </p>
      </div>
    ),
    diagram: <HeisenbergMetaphorDiagram />,
    keywords:
      "名字 由來 海森堡 Heisenberg 算盤 abacus 不確定原理 uncertainty 觀測者效應 量子 quantum 疊加 superposition 坍縮 collapse metaphor 物理學",
  },
  {
    id: "architecture",
    q: "整體服務架構長什麼樣?各層之間怎麼串起來?",
    summary:
      "4 層架構:輸入層(瀏覽器 / 語音)→ Agent Pipeline 層(5 個 LLM agent 串接 + SSE streaming)→ 計算層(純函式 · 5 維雷達 + 意願公式 + applyShocks)→ 視覺化層(散佈圖 + 三層桑基 + 報告卡)。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          整套服務分四層,
          <span className="text-amber-300 mx-1">越往下越接近確定性的純函式</span>
          ,越往上越依賴 LLM 與使用者互動。設計目標:
          <strong className="text-cyan-300 mx-1">LLM 只負責「逐字答案」</strong>
          ,<strong className="text-emerald-300 mx-1">純函式負責「結構性結論」</strong>。
        </p>

        <div className="space-y-2 text-xs">
          <div className="border border-blue-500/40 bg-blue-500/5 rounded p-3">
            <div className="text-blue-300 font-semibold mb-1">
              ① 輸入層 · Browser-First
            </div>
            <div className="text-slate-300 space-y-1">
              <p>
                Next.js 14 App Router 前端,純 React + Tailwind。三種入口都會匯到同一條 pipeline:
              </p>
              <ul className="list-disc list-inside text-slate-400 ml-1 space-y-0.5">
                <li>主對話介面(/)— 打字提問</li>
                <li>語音控制 — Web Speech API + 喚醒詞 + LLM 意圖</li>
                <li>人物設定 (/admin)— persona 池編輯</li>
              </ul>
            </div>
          </div>

          <div className="border border-violet-500/40 bg-violet-500/5 rounded p-3">
            <div className="text-violet-300 font-semibold mb-1">
              ② Agent Pipeline 層 · 5 個 LLM agent 串接
            </div>
            <div className="text-slate-300 space-y-1.5">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-1 text-[11px]">
                <div className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1 text-center">
                  <div className="text-cyan-300 font-bold">① 啟動者</div>
                  <div className="text-slate-400 text-[10px]">entry</div>
                </div>
                <div className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1 text-center">
                  <div className="text-violet-300 font-bold">② 觀測者 PM</div>
                  <div className="text-slate-400 text-[10px]">出題</div>
                </div>
                <div className="bg-emerald-500/15 border border-emerald-500/50 rounded px-2 py-1 text-center">
                  <div className="text-emerald-300 font-bold">③ 對話者 ×30</div>
                  <div className="text-slate-400 text-[10px]">parallel</div>
                </div>
                <div className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1 text-center">
                  <div className="text-amber-300 font-bold">④ 彙整者</div>
                  <div className="text-slate-400 text-[10px]">summary</div>
                </div>
                <div className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1 text-center">
                  <div className="text-rose-300 font-bold">⑤ PM 報告</div>
                  <div className="text-slate-400 text-[10px]">report</div>
                </div>
              </div>
              <p className="text-slate-400">
                全用 MiniMax-M2.5,透過 Anthropic SDK 相容 endpoint
                ({" "}
                <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
                  api.minimax.io/anthropic
                </code>{" "}
                )。前端用 SSE streaming 即時收每位 persona 完成事件。
              </p>
              <p className="text-slate-400">
                Concurrency 全域 semaphore(預設 6)避免 429,失敗自動 exp-backoff retry。
              </p>
            </div>
          </div>

          <div className="border border-emerald-500/40 bg-emerald-500/5 rounded p-3">
            <div className="text-emerald-300 font-semibold mb-1">
              ③ 計算層 · 純函式,無 LLM
            </div>
            <div className="text-slate-300 space-y-1">
              <p>
                LLM 給出「逐字答案」之後,所有圖表上的數字都由
                <strong className="text-amber-300 mx-1">確定性公式</strong>算出 —
                跟 LLM 黑箱分離。
              </p>
              <ul className="list-disc list-inside text-slate-400 ml-1 space-y-0.5">
                <li>
                  <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
                    computeRadarScores
                  </code>{" "}
                  — persona 11 欄位 → 5 維雷達分數(0-100)
                </li>
                <li>
                  <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
                    computePurchaseIntent
                  </code>{" "}
                  — 雷達 × 產品參數 → 意願度
                </li>
                <li>
                  <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
                    applyShocks
                  </code>{" "}
                  — 套通膨 / 失業扣分
                </li>
                <li>
                  <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
                    buildThreeLayerFlows
                  </code>{" "}
                  — 桑基三層資料聚合
                </li>
              </ul>
            </div>
          </div>

          <div className="border border-amber-500/40 bg-amber-500/5 rounded p-3">
            <div className="text-amber-300 font-semibold mb-1">
              ④ 視覺化層 · SVG-Native
            </div>
            <div className="text-slate-300 space-y-1">
              <p>
                全部自製 SVG,不依賴圖表函式庫(避開 D3 / Chart.js 的學習曲線與 bundle 體積)。
              </p>
              <ul className="list-disc list-inside text-slate-400 ml-1 space-y-0.5">
                <li>
                  <strong className="text-slate-200">PhaseTransitionMap</strong> —
                  行為相變散佈圖(X 經濟壓力, Y 購買意願)
                </li>
                <li>
                  <strong className="text-slate-200">DecisionSankey</strong> —
                  三層桑基(語意 → 行為誘因 → 決策),漸變色 ribbon
                </li>
                <li>
                  <strong className="text-slate-200">ReportCard</strong> —
                  完整決策報告 + html2canvas/jspdf 匯出
                </li>
                <li>
                  <strong className="text-slate-200">AbacusBar</strong> —
                  底部 sticky 算盤珠 + 外部衝擊滑桿
                </li>
              </ul>
              <p className="text-slate-400 mt-1">
                共用
                <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px] mx-1">
                  ProductParamsContext
                </code>
                狀態,滑桿一動所有面板 useMemo 即時重算(參見 Q15)。
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-slate-900/60 border border-slate-700 rounded text-xs">
          <div className="text-cyan-300 font-semibold mb-1">🔧 Tech Stack</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5 text-slate-300">
            <span>· Next.js 14 (App Router · SSE)</span>
            <span>· TypeScript</span>
            <span>· Tailwind CSS</span>
            <span>· 純 SVG(不用 D3 / Chart.js)</span>
            <span>· Anthropic SDK → MiniMax-M2.5</span>
            <span>· HttpOnly cookie auth</span>
            <span>· JSON file storage (persona / log)</span>
            <span>· html2canvas + jspdf (PDF 匯出)</span>
            <span>· react-markdown (報告渲染)</span>
            <span>· opencc-js (簡 → 繁轉換)</span>
            <span>· Nodemailer (Gmail SMTP)</span>
            <span>· Web Speech API (STT,瀏覽器內建)</span>
          </div>
        </div>

        <div className="mt-2 p-3 bg-slate-900/60 border border-slate-700 rounded text-xs">
          <div className="text-amber-300 font-semibold mb-1">⚖ 設計取捨</div>
          <ul className="list-disc list-inside text-slate-300 space-y-0.5">
            <li>
              <strong>無資料庫</strong>:用 JSON file 存 persona / log,部署門檻最低,單機可跑;
              未來換 Postgres 只需替換
              <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px] mx-1">
                lib/personas-store.ts
              </code>
              一個檔。
            </li>
            <li>
              <strong>無圖表函式庫</strong>:自製 SVG 雖然辛苦,但可完全控制動畫(transition cubic-bezier)、
              不受函式庫 API 限制,bundle 小 100KB+。
            </li>
            <li>
              <strong>結構化 LLM 輸出</strong>:強制每個 agent 回 JSON schema,避免自由格式回應拖累 pipeline。
            </li>
            <li>
              <strong>計算與 LLM 分離</strong>:任何結構性數字都不依賴 LLM,審計性是業務 / 風控的硬需求。
            </li>
          </ul>
        </div>
      </div>
    ),
    diagram: <ArchitectureDiagram />,
    keywords:
      "架構 architecture 服務 service 系統 system 分層 layer pipeline agent SSE streaming 計算 視覺化 tech stack 設計 Next.js MiniMax",
  },
  // ──────────── 業務 / 策略層 ────────────
  {
    id: "credibility",
    q: "怎麼證明「虛擬外送員」的回覆可信?不是 AI 自己幻想?",
    summary:
      "誠實說:不能 100% 證明完全可信 — 這是合成市調的本質限制。但用 3 條交叉驗證:(1) 人格骨幹基於真實田野;(2) 5 維雷達 + 意願公式是可審計數學;(3) 上線前對小樣本真人做 calibration 比對。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          這是合成市調最該被嚴格挑戰的問題。海森堡的對應是
          <strong className="text-amber-300 mx-1">分層信心建構</strong>
          + 誠實標示限制邊界。
        </p>

        <div className="space-y-2 text-xs">
          <div className="border border-blue-500/40 bg-blue-500/5 rounded p-3">
            <div className="text-blue-300 font-semibold mb-1">
              ① 人格骨幹基於真實田野
            </div>
            <div className="text-slate-300">
              HackMD「人設設定」章節的 30 位骨幹,
              <span className="text-amber-300 mx-1">原型來自實際外送員訪談 + 產業報告</span>
              ,不是 LLM 憑空想像。年收入級距、家庭結構、車況描述、信用狀態等對應台灣外送員的真實光譜。
            </div>
          </div>
          <div className="border border-emerald-500/40 bg-emerald-500/5 rounded p-3">
            <div className="text-emerald-300 font-semibold mb-1">
              ② 數字可審計,不是 LLM 黑箱
            </div>
            <div className="text-slate-300">
              散佈圖座標、桑基絲帶寬度、滲透率 % 全部用啟發式公式(<code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">lib/persona-scores.ts</code>),
              <span className="text-amber-300 mx-1">任何一格都能追到具體 regex 命中與加減分</span>
              。LLM 只負責「逐字答案」,不負責「數字結論」。
            </div>
          </div>
          <div className="border border-amber-500/40 bg-amber-500/5 rounded p-3">
            <div className="text-amber-300 font-semibold mb-1">
              ③ 上線前 calibration
            </div>
            <div className="text-slate-300">
              demo 階段建議搭配
              <span className="text-amber-300 mx-1">5-10 位真實外送員做 ground truth 比對</span>
              :同一題人/海森堡各跑一次,看結構性結論差距(共識點、分歧點、族群分布)。
              小成本就能算出信心區間,正式報告附上「人機差異 %」當決策附件。
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs space-y-1">
          <div className="text-rose-300 font-semibold">⚠ 適合 vs 不適合</div>
          <div className="text-slate-300">
            <strong>適合:</strong> 早期概念可行性、訂價彈性測試、文案分眾、競品差異化嗅探
          </div>
          <div className="text-slate-300">
            <strong>不適合替代:</strong> 上市前 GTM 規模驗證、法規敏感性訪談、品牌情感深訪
          </div>
        </div>
      </div>
    ),
    diagram: <CredibilityDiagram />,
    keywords:
      "可信 credibility 幻覺 hallucination 田野 calibration 驗證 validation 真實性 信任 ground truth 啟發式 黑箱",
  },
  {
    id: "value-beyond-classification",
    q: "語意分析收斂結果,是不是只是把大家講過的話再分類?能帶來什麼決策?",
    summary:
      "對,90% 工序本質是分類。但加上「算盤珠 trade-off」+「shock 模擬」這兩個 what-if 能力後,變成傳統市調做不到的決策工具 — 業務、行銷、風控各取所需。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          坦白說:語意脈絡 → 行為誘因 → 決策 三層分類,本質上就是「把答案歸類」。
          這跟傳統市調的編碼分析沒兩樣。但海森堡多了兩個傳統做不到的能力:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="border border-violet-500/40 bg-violet-500/5 rounded p-3">
            <div className="text-violet-300 font-semibold mb-1">
              ① 參數可調(算盤珠 trade-off)
            </div>
            <div className="text-slate-300 space-y-1">
              <p>
                利率從 6% 撥到 8%、月費從 199 撥到 399 —
                <span className="text-amber-300 mx-1">同一群人在不同條件下會怎麼分布?</span>
              </p>
              <p className="text-slate-400 italic">
                傳統市調做不到:你不能讓真實受訪者「再經歷一次同樣的訪談,但條件改了」。
              </p>
            </div>
          </div>
          <div className="border border-rose-500/40 bg-rose-500/5 rounded p-3">
            <div className="text-rose-300 font-semibold mb-1">
              ② shock 疊加(壓力測試)
            </div>
            <div className="text-slate-300 space-y-1">
              <p>
                通膨從 0% 撥到 6%、失業 4% 撥到 10% —
                <span className="text-amber-300 mx-1">弱勢族群會先在臨界點掉出市場?</span>
              </p>
              <p className="text-slate-400 italic">
                傳統市調做不到:沒辦法問「如果失業率明天變 15%,你的回答會怎麼變?」
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-slate-900/60 border border-slate-700 rounded text-xs">
          <div className="text-amber-300 font-semibold mb-2">三層決策落點</div>
          <div className="space-y-2 text-slate-300">
            <div>
              <span className="text-violet-300 font-semibold">💼 業務 / PM:</span>{" "}
              撥利率珠子找滲透率與單戶利潤的甜蜜點 → 訂價建議
            </div>
            <div>
              <span className="text-pink-300 font-semibold">📣 行銷:</span>{" "}
              看桑基中間層 — 對省錢族打「加油回饋」、對便利族打「30 秒核卡」分眾文案
            </div>
            <div>
              <span className="text-rose-300 font-semibold">🛡 風控:</span>{" "}
              加 shock 後失業/通膨族占比 → 預警逾期風險、設信用門檻
            </div>
          </div>
        </div>
      </div>
    ),
    keywords:
      "分類 classification trade-off what-if 模擬 simulation 決策 decision 業務 行銷 風控 訂價 分眾 編碼分析",
  },
  {
    id: "target-users",
    q: "你們預期這要給誰用?企劃?產品?風管?通路?",
    summary:
      "主要四象限:PM / 行銷 / 風控適合;通路較不適合(他們需要 face-to-face)。具體分工:PM 做早期 idea validation、行銷做文案分眾、風控做壓力測試、通路用作前期客群 briefing。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          海森堡是「早期概念驗證」工具,適合<strong className="text-amber-300 mx-1">需要快速試錯</strong>
          + <strong className="text-amber-300 mx-1">資料受限</strong>的場景。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <div className="border border-emerald-500/40 bg-emerald-500/5 rounded p-3">
            <div className="text-emerald-300 font-semibold mb-1">
              ✓ PM / 企劃 — 主用戶
            </div>
            <div className="text-slate-300">
              GTM 前先濾掉爛 idea。一週可跑 50 輪概念測試,
              <span className="text-amber-300">把資源集中到通過驗證的方案</span>。
            </div>
          </div>
          <div className="border border-emerald-500/40 bg-emerald-500/5 rounded p-3">
            <div className="text-emerald-300 font-semibold mb-1">
              ✓ 行銷 — 文案分眾
            </div>
            <div className="text-slate-300">
              桑基中間層直接告訴你:省錢族該打 A、便利族該打 B、風險規避族該打 C。
              <span className="text-amber-300">不用等 A/B test 跑 30 天</span>。
            </div>
          </div>
          <div className="border border-emerald-500/40 bg-emerald-500/5 rounded p-3">
            <div className="text-emerald-300 font-semibold mb-1">
              ✓ 風控 — 壓力測試
            </div>
            <div className="text-slate-300">
              通膨 6% + 失業 8% 情境下哪些 persona 最先退場?
              <span className="text-amber-300">提前設信用門檻、調整額度</span>。
            </div>
          </div>
          <div className="border border-amber-500/40 bg-amber-500/5 rounded p-3">
            <div className="text-amber-300 font-semibold mb-1">△ 通路 — 輔助用</div>
            <div className="text-slate-300">
              通路同仁本來就會直接接觸客戶。海森堡可作為
              <span className="text-amber-300">分行進駐前的客群分布 briefing</span>
              ,而非主決策工具。
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs space-y-1">
          <div className="text-rose-300 font-semibold">不適合場景</div>
          <div className="text-slate-300">
            · 終局 GTM 決策(仍需真人驗證)<br />
            · 法規敏感性訪談(隱私 / 知情同意問題)<br />
            · 純情感性訪談(品牌喜好深訪 — LLM 還難掌握微妙情緒)
          </div>
        </div>
      </div>
    ),
    diagram: <TargetUsersDiagram />,
    keywords:
      "誰用 對象 target users 企劃 PM 產品 行銷 marketing 風控 risk 通路 channel 應用場景 use case",
  },
  {
    id: "roadmap",
    q: "下一步的落地里程碑是什麼?",
    summary:
      "三階段:(1) 短期 — 真人 calibration + LLM cache + 多語言;(2) 中期 — 進駐 1-2 個產品線試點 + B 端 SDK;(3) 長期 — SaaS 多租戶 + 接 CRM 接其他 LLM 接 BI。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          以 demo 後 12 個月為時間軸,三階段交付:
        </p>

        <div className="space-y-2 text-xs">
          <div className="border-l-4 border-cyan-500 bg-cyan-500/5 rounded-r-lg p-3">
            <div className="text-cyan-300 font-semibold mb-1">
              🚀 短期(1-3 個月) · MVP 驗證
            </div>
            <ul className="list-disc list-inside text-slate-300 space-y-0.5">
              <li>真人 calibration:對 10 位真實外送員跑 ground truth 比對</li>
              <li>LLM 回應 cache:demo 場景預錄 / replay,網路不穩也能展示</li>
              <li>多語言 persona pool:擴 50 → 100 位涵蓋不同族群</li>
              <li>內部 dogfood:行銷團隊每週使用,蒐集真實 use case</li>
            </ul>
          </div>
          <div className="border-l-4 border-violet-500 bg-violet-500/5 rounded-r-lg p-3">
            <div className="text-violet-300 font-semibold mb-1">
              🎯 中期(3-6 個月) · 產品線試點
            </div>
            <ul className="list-disc list-inside text-slate-300 space-y-0.5">
              <li>跟 1-2 個事業單位合作(信貸 / 信用卡)</li>
              <li>每月跑 4-8 輪正式概念驗證,跟傳統市調並行比對</li>
              <li>B 端 SDK:提供 API + iframe embed,可嵌入內部工具</li>
              <li>輸出標準化:報告格式對齊行內 PMR 規範</li>
            </ul>
          </div>
          <div className="border-l-4 border-amber-500 bg-amber-500/5 rounded-r-lg p-3">
            <div className="text-amber-300 font-semibold mb-1">
              🌐 長期(6-12 個月) · 平台化
            </div>
            <ul className="list-disc list-inside text-slate-300 space-y-0.5">
              <li>SaaS 多租戶:不同企業 / 部門各自的 persona 池</li>
              <li>接 CRM:從真實客戶資料(去識別化後)生成更精準 persona 骨幹</li>
              <li>接其他 LLM:Claude / GPT-5 / Gemini 平行比對,降低單一模型偏誤</li>
              <li>接 BI:Looker / Tableau 連接 → 散佈圖 / 桑基 datafeed</li>
            </ul>
          </div>
        </div>

        <p className="text-xs text-slate-400 mt-2">
          每個里程碑都有
          <span className="text-amber-300 mx-1">go / no-go 評估指標</span>
          :calibration 結構性結論誤差 &lt; 15% 才推中期、產品線試點 ROI &gt; 8× 才推長期。
        </p>
      </div>
    ),
    diagram: <RoadmapDiagram />,
    keywords:
      "里程碑 milestone roadmap 落地 deploy 短期 中期 長期 calibration SDK SaaS 多租戶",
  },
  // ──────────── 系統 / 技術層 ────────────
  {
    id: "summary-bias",
    q: "AI 彙整結果會不會失真?彙整 AI 角色會不會出現幻覺?不是站在中立角色。",
    summary:
      "會有幻覺風險,這是 LLM 本質。海森堡用 4 道防線:(1) Bouncer 套話過濾;(2) Summary 強制引用具體 persona id 才能下結論;(3) JSON schema 強制結構化;(4) 任何結論都可回溯到原始答案。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          彙整 agent 本質是 LLM,
          <span className="text-rose-300 mx-1">三種偏誤風險真實存在</span>:
        </p>

        <div className="border border-rose-500/30 bg-rose-500/5 rounded p-3 text-xs space-y-1.5">
          <div className="text-rose-300 font-semibold mb-1">⚠ 三種失真模式</div>
          <div className="text-slate-300">
            <strong>1. 幻覺結論</strong>:把「沒人說過的話」當成共識
          </div>
          <div className="text-slate-300">
            <strong>2. 政治正確化</strong>:LLM 訓練偏好溫和語氣 — 弱化極端立場
          </div>
          <div className="text-slate-300">
            <strong>3. 弱訊號放大</strong>:少數人提到的點被當成主要趨勢
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <div className="border border-blue-500/40 bg-blue-500/5 rounded p-2.5">
            <div className="text-blue-300 font-semibold mb-1">
              防線 1 · Bouncer 套話過濾
            </div>
            <div className="text-slate-300">
              彙整前先掃一輪「總體而言」「整體來看」「以下分析」這類 LLM 套話,
              強制留下有實質受訪者 voice 的句子。
            </div>
          </div>
          <div className="border border-emerald-500/40 bg-emerald-500/5 rounded p-2.5">
            <div className="text-emerald-300 font-semibold mb-1">
              防線 2 · 引用具體 persona
            </div>
            <div className="text-slate-300">
              Summary system prompt 強制要求每個結論必須附上
              <span className="text-amber-300 mx-1">至少 2 位 persona id</span>當佐證,
              沒佐證的結論直接打回。
            </div>
          </div>
          <div className="border border-violet-500/40 bg-violet-500/5 rounded p-2.5">
            <div className="text-violet-300 font-semibold mb-1">
              防線 3 · JSON schema 強制結構
            </div>
            <div className="text-slate-300">
              keyFindings 限 3-4 條 + 每條限字數 + metric 必須是具體數字。
              <span className="text-amber-300">逼 LLM 不能說廢話</span>。
            </div>
          </div>
          <div className="border border-amber-500/40 bg-amber-500/5 rounded p-2.5">
            <div className="text-amber-300 font-semibold mb-1">
              防線 4 · 可追溯設計
            </div>
            <div className="text-slate-300">
              ReportCard 每個 finding 可下鑽到原始 QA — 點任一結論能看到
              <span className="text-amber-300 mx-1">支撐這個結論的 persona 原話清單</span>
              。LLM 編造的話會無處可指。
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400 mt-2">
          <strong>誠實標示:</strong> 不能 100% 解 — 但設計上強制每個結論可被檢驗,
          配合人類 reviewer flow 可降到實用水準。
        </p>
      </div>
    ),
    keywords:
      "彙整 summary 失真 bias 幻覺 hallucination 偏誤 政治正確 套話 bouncer 中立 可追溯 audit",
  },
  {
    id: "reproducibility",
    q: "同一題跑兩次會一樣嗎?趨勢會一樣?",
    summary:
      "字面回答略有不同(LLM 是 stochastic),但結構性結論(支持度 %、族群分布、桑基絲帶)趨勢穩定。實務上跑 3 次取平均能達到 95% 信心區間 — 成本仍便宜。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          這是合成市調必問的可重現性問題。誠實答:
          <span className="text-amber-300 mx-1">逐字不一樣,但結構穩定</span>。
        </p>

        <div className="border border-slate-700 rounded p-3 bg-slate-900/40 text-xs space-y-2">
          <div className="text-cyan-300 font-semibold">📊 兩次跑同一題的差異層級</div>
          <div className="text-slate-300">
            <strong className="text-rose-300">逐字答案 ✗</strong>{" "}
            完全相同 — LLM 有 temperature,每次選詞略不同。
          </div>
          <div className="text-slate-300">
            <strong className="text-amber-300">具體數字 ~5-10% 波動</strong>{" "}
            — 例如「想買的比例 65% → 第二次 70%」這種輕微擺盪。
          </div>
          <div className="text-slate-300">
            <strong className="text-emerald-300">結構性結論 ✓</strong>{" "}
            穩定 — 共識點、分歧點、族群分布的相對排序不會翻盤。
          </div>
          <div className="text-slate-300">
            <strong className="text-emerald-300">桑基絲帶比例 ✓</strong>{" "}
            穩定 — 主要 keyword → decision 路徑寬度 ±5% 內。
          </div>
        </div>

        <div className="mt-3 p-3 bg-slate-900/60 border border-slate-700 rounded text-xs">
          <div className="text-amber-300 font-semibold mb-1">提升可重現性的實務做法</div>
          <ul className="list-disc list-inside text-slate-300 space-y-0.5">
            <li>
              <strong>跑 3 次取平均</strong>:NT$ 15-45,可算 95% 信心區間
            </li>
            <li>
              <strong>降低 temperature</strong>:從 0.7 調到 0.3,變異減少但回答可能變單調
            </li>
            <li>
              <strong>固定 seed</strong>:目前 MiniMax 不支援,Claude / GPT 可用
            </li>
            <li>
              <strong>結構化輸出</strong>:把 LLM 鎖在 JSON schema,字面變化空間小很多
            </li>
          </ul>
        </div>

        <p className="text-xs text-slate-400 mt-2">
          <strong>給決策者的說法:</strong> 數字當「方向參考」不當「絕對值」,跟傳統市調的
          <span className="text-amber-300 mx-1">±5% 抽樣誤差</span>性質類似。
        </p>
      </div>
    ),
    keywords:
      "可重現 reproducibility stochastic 隨機 temperature 變異 信心區間 confidence interval 結構性 趨勢 stable",
  },
  {
    id: "cost",
    q: "若可落地,預期成本大約多少?",
    summary:
      "單次跑 NT$ 5-15(目前 MiniMax-M2.5)。建議計價:免費 5 次/月、Pro NT$ 999/月 100 次、Enterprise 客製。比傳統市調 NT$ 5-20 萬便宜約 10,000-40,000 倍。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          目前 demo 階段每次 chat 實測成本約 NT$ 5-15,主要看 token 用量(input ~30K + output ~15K)。
        </p>

        <div className="border border-slate-700 rounded p-3 bg-slate-900/40 text-xs space-y-2">
          <div className="text-cyan-300 font-semibold">💰 成本拆解(單次跑 30 位)</div>
          <div className="flex justify-between text-slate-300">
            <span>LLM tokens (MiniMax-M2.5)</span>
            <span className="tabular-nums">NT$ 5-12</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Pollinations portraits</span>
            <span className="tabular-nums text-slate-500">免費(已預生)</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>寄信(Gmail SMTP)</span>
            <span className="tabular-nums text-slate-500">免費</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>伺服器(Vercel hobby)</span>
            <span className="tabular-nums text-slate-500">$0-20/月固定</span>
          </div>
          <div className="border-t border-slate-700 pt-2 flex justify-between text-slate-100 font-bold">
            <span>單次跑 total</span>
            <span className="tabular-nums">NT$ 5-15</span>
          </div>
        </div>

        <div className="border border-slate-700 rounded p-3 bg-slate-900/40 text-xs">
          <div className="text-amber-300 font-semibold mb-2">建議商業化計價</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="border border-slate-600 rounded p-2 text-center">
              <div className="text-slate-400 text-[10px] uppercase">Free</div>
              <div className="text-slate-100 text-lg font-bold tabular-nums">NT$ 0</div>
              <div className="text-slate-400 text-[11px]">5 次 / 月</div>
              <div className="text-slate-500 text-[10px] mt-1">試水溫</div>
            </div>
            <div className="border border-violet-500/50 bg-violet-500/10 rounded p-2 text-center">
              <div className="text-violet-300 text-[10px] uppercase font-bold">Pro</div>
              <div className="text-violet-200 text-lg font-bold tabular-nums">NT$ 999</div>
              <div className="text-violet-200 text-[11px]">100 次 / 月</div>
              <div className="text-slate-400 text-[10px] mt-1">PM 個人版</div>
            </div>
            <div className="border border-amber-500/50 bg-amber-500/10 rounded p-2 text-center">
              <div className="text-amber-300 text-[10px] uppercase font-bold">Enterprise</div>
              <div className="text-amber-200 text-lg font-bold">客製</div>
              <div className="text-amber-200 text-[11px]">不限次數</div>
              <div className="text-slate-400 text-[10px] mt-1">部門整合</div>
            </div>
          </div>
        </div>

        <div className="mt-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs">
          <div className="text-emerald-300 font-semibold mb-1">📊 對照真實市調</div>
          <div className="text-slate-300">
            傳統 30 位深訪市調:
            <span className="text-rose-300 mx-1">NT$ 5-20 萬</span> · 14-21 天 ·{" "}
            <span className="text-amber-300 mx-1">10,000-40,000× 倍率</span>節省
          </div>
        </div>
      </div>
    ),
    diagram: <CostTierDiagram />,
    keywords:
      "成本 cost 預算 budget 計價 pricing tier 訂閱 商業化 NT$ token API 費用",
  },
  {
    id: "multi-tenant",
    q: "系統未來如何讓其他單位進行使用?",
    summary:
      "三階段擴張:(1) 短期 — 內部多帳號 + persona 池分組;(2) 中期 — 公開 API + iframe embed + Webhook;(3) 長期 — 多租戶 SaaS + RBAC + 計費 dashboard。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          從目前單一團隊使用 → 多單位 → 多企業的擴張路徑:
        </p>

        <div className="space-y-2 text-xs">
          <div className="border-l-4 border-cyan-500 bg-cyan-500/5 rounded-r-lg p-3">
            <div className="text-cyan-300 font-semibold mb-1">
              階段 1 · 內部分組(下個月)
            </div>
            <ul className="list-disc list-inside text-slate-300 space-y-0.5">
              <li>
                <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
                  AUTH_USERS
                </code>{" "}
                加 tenant_id 欄位,登入後依組別看不同 persona 池
              </li>
              <li>共用 LLM 額度,以部門別記帳</li>
              <li>各組可獨立維護自家 persona 池(信貸組 / 信用卡組 / 保險組)</li>
            </ul>
          </div>
          <div className="border-l-4 border-violet-500 bg-violet-500/5 rounded-r-lg p-3">
            <div className="text-violet-300 font-semibold mb-1">
              階段 2 · 公開介接(Q4)
            </div>
            <ul className="list-disc list-inside text-slate-300 space-y-0.5">
              <li>
                Open API:
                <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
                  POST /api/run-survey
                </code>{" "}
                接收 JSON,任何系統可直接呼叫
              </li>
              <li>iframe embed:Notion / Confluence / 行內 wiki 可嵌入散佈圖 widget</li>
              <li>Webhook:跑完自動推送報告連結到 Slack / Teams</li>
              <li>SDK (Node / Python):給 data scientists 程式化批次跑</li>
            </ul>
          </div>
          <div className="border-l-4 border-amber-500 bg-amber-500/5 rounded-r-lg p-3">
            <div className="text-amber-300 font-semibold mb-1">
              階段 3 · 多租戶 SaaS(2027)
            </div>
            <ul className="list-disc list-inside text-slate-300 space-y-0.5">
              <li>各企業獨立帳號 + 自己的 persona 池</li>
              <li>RBAC:管理員 / 編輯 / 觀察員三種角色</li>
              <li>Audit log + 計費 dashboard</li>
              <li>SSO 接 Azure AD / Okta / Google Workspace</li>
              <li>資料隔離 + 個資合規(GDPR / 個資法)</li>
            </ul>
          </div>
        </div>

        <div className="mt-3 p-3 bg-slate-900/60 border border-slate-700 rounded text-xs">
          <div className="text-amber-300 font-semibold mb-1">技術可行性</div>
          <div className="text-slate-300">
            目前架構是 Next.js + JSON file storage + Anthropic SDK,
            <span className="text-emerald-300 mx-1">所有擴展點都已預留</span>:
            persona-store 抽 interface 可換 Postgres、auth 加 tenant_id、API 路由現成。
            技術成本不高,主要工作在前端 admin UI 跟計費邏輯。
          </div>
        </div>
      </div>
    ),
    diagram: <ScalingDiagram />,
    keywords:
      "擴展 scale 多租戶 multi-tenant tenant SDK API iframe embed Webhook RBAC SSO SaaS 部門 企業 計費",
  },
  {
    id: "live-reactivity",
    q: "拉動算盤珠 / 通膨滑桿,30 顆粒子怎麼即時重新坍縮?有完整公式嗎?",
    summary:
      "React context 廣播參數 → 每張面板 useMemo 對 30 位跑「雷達 → 意願 → 衝擊」三步驟管線 → SVG 屬性 + CSS transition 做彈性動畫,從滑桿動到畫面定位 < 50ms。完整公式參考 Q5。",
    body: (
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
        <p>
          這是「為什麼撥珠子畫面立刻動」背後的反應鏈。把它拆成
          <span className="text-amber-300 mx-1">三段事件流</span>:
        </p>

        <div className="space-y-2 text-xs">
          <div className="border border-blue-500/40 bg-blue-500/5 rounded p-3">
            <div className="text-blue-300 font-semibold mb-1">
              事件流 1 · 滑桿 → Context state
            </div>
            <div className="text-slate-300 space-y-1">
              <p>
                <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
                  &lt;input type=&quot;range&quot;&gt;
                </code>{" "}
                的 onChange 呼叫
                <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px] mx-1">
                  setParamValue(Number(e.target.value))
                </code>
                ,改寫
                <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px] mx-1">
                  ProductParamsContext
                </code>
                的 React state。
              </p>
              <p className="text-slate-400">
                shocks (通膨 / 失業) 也走同一個 context — 整個 SimulationLab 都是 consumer。
              </p>
            </div>
          </div>

          <div className="border border-emerald-500/40 bg-emerald-500/5 rounded p-3">
            <div className="text-emerald-300 font-semibold mb-1">
              事件流 2 · 三步驟計算管線(每位 persona 跑一次)
            </div>
            <div className="text-slate-300 space-y-1.5">
              <p>
                Context 改變 → consumers(散佈圖 / 桑基 / CLV)的{" "}
                <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
                  useMemo
                </code>{" "}
                重算,對 30 位 persona 跑下面三步:
              </p>
              <div className="bg-slate-950 rounded p-2 font-mono text-[11px] text-slate-300 leading-relaxed">
                <span className="text-slate-500"># Step 1:從 persona 11 欄位推 5 維雷達(僅 persona 變才重算)</span>
                <br />
                scores = computeRadarScores(persona)
                <br />
                <br />
                <span className="text-slate-500"># Step 2:套產品意願公式(滑桿一動就重算)</span>
                <br />
                base = computePurchaseIntent(scores, params)
                <br />
                <br />
                <span className="text-slate-500"># Step 3:套外部衝擊扣分</span>
                <br />
                <span className="text-amber-300">final_intent</span> = applyShocks(base, scores, shocks)
              </div>
              <p className="text-slate-400 mt-2">
                <strong className="text-amber-300">完整公式</strong>請看 Q5「散佈圖數字怎麼算」 —
                這裡只講反應鏈。
              </p>
            </div>
          </div>

          <div className="border border-violet-500/40 bg-violet-500/5 rounded p-3">
            <div className="text-violet-300 font-semibold mb-1">
              事件流 3 · SVG 屬性更新 + CSS transition
            </div>
            <div className="text-slate-300 space-y-1">
              <p>
                新 intent 算完 → React 把 SVG{" "}
                <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
                  &lt;circle&gt;
                </code>{" "}
                的{" "}
                <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">cy</code>{" "}
                屬性更新到新位置。
              </p>
              <p>
                CSS transition:
                <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px] mx-1">
                  cy 700ms cubic-bezier(0.34, 1.56, 0.64, 1)
                </code>{" "}
                ,粒子用「彈跳曲線」滑到新位置,有量子坍縮的視覺感。
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-slate-900/60 border border-slate-700 rounded text-xs">
          <div className="text-amber-300 font-semibold mb-1">⚡ 效能</div>
          <div className="text-slate-300 space-y-0.5">
            <p>
              30 位 × 3 步驟 ≈{" "}
              <span className="text-emerald-300 font-semibold">90 次純 JS 計算</span> +{" "}
              <span className="text-emerald-300 font-semibold">30 次 SVG 屬性 diff</span> 。
            </p>
            <p>
              整段 &lt; 1ms,輕鬆 60 fps。滑桿動到畫面定位通常 &lt; 50ms(主要花在瀏覽器 paint)。
            </p>
            <p className="text-slate-500 mt-1">
              persona 不變時 scores 會被 useMemo cache,實際每次只重跑 Step 2 + Step 3 ≈ 60 次計算。
            </p>
          </div>
        </div>

        <div className="mt-2 p-3 bg-slate-900/60 border border-slate-700 rounded text-xs space-y-1">
          <div className="text-cyan-300 font-semibold">📁 關鍵檔案</div>
          <div className="text-slate-300">
            ·{" "}
            <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
              lib/product-params-context.tsx
            </code>{" "}
            — 共用參數 + shocks 廣播中樞
          </div>
          <div className="text-slate-300">
            ·{" "}
            <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
              lib/persona-scores.ts
            </code>{" "}
            — Radar + Intent 公式
          </div>
          <div className="text-slate-300">
            ·{" "}
            <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
              lib/persona-projections.ts
            </code>{" "}
            — applyShocks(通膨 / 失業)
          </div>
          <div className="text-slate-300">
            ·{" "}
            <code className="text-cyan-300 bg-slate-950 px-1 rounded text-[10px]">
              components/PhaseTransitionMap.tsx
            </code>{" "}
            — 散佈圖 consumer + transition CSS
          </div>
        </div>
      </div>
    ),
    diagram: <ReactivityFlowDiagram />,
    keywords:
      "即時 real-time 更新 reactive reactivity 滑桿 slider 算盤珠 計算 公式 formula context useMemo SVG transition 動畫 animation 效能 performance 反應鏈",
  },
];

/** 把搜尋字串拆成關鍵字陣列(空白分隔),每個 token 都要在 entry 文字裡命中才算 match。 */
function entryMatchesQuery(entry: FAQEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${entry.q} ${entry.summary} ${entry.keywords ?? ""}`.toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => haystack.includes(t));
}

export function ServiceFAQ() {
  const [open, setOpen] = useState(false);
  // 預設不展開任何一筆 — 使用者主動點才展開,搜尋時也維持收合狀態
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // AI fallback — 搜尋沒命中時,使用者可主動觸發 LLM 即時回答
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAskedQuery, setAiAskedQuery] = useState<string | null>(null);

  const filtered = query.trim()
    ? FAQ_ENTRIES.filter((e) => entryMatchesQuery(e, query))
    : FAQ_ENTRIES;

  // Esc 關閉(或在搜尋框內按 Esc 先清搜尋,再關)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (query) setQuery("");
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, query]);

  // 每次打開 modal 重置搜尋 / 展開 / AI 答覆狀態
  useEffect(() => {
    if (open) {
      setQuery("");
      setExpandedId(null);
      setAiAnswer(null);
      setAiError(null);
      setAiAskedQuery(null);
    }
  }, [open]);

  // 搜尋字串改變時清掉 AI 答案(舊問題的答案不再 relevant)
  useEffect(() => {
    setAiAnswer(null);
    setAiError(null);
    setAiAskedQuery(null);
  }, [query]);

  async function askAI(question: string) {
    setAiLoading(true);
    setAiError(null);
    setAiAnswer(null);
    setAiAskedQuery(question);
    try {
      const res = await fetch("/api/faq-ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok || !data.answer) {
        setAiError(data.error ?? "AI 沒有回應,請稍後重試");
      } else {
        setAiAnswer(data.answer);
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiLoading(false);
    }
  }

  // 語音控制 — 監聽 VoiceControl 的 voice:open-faq event 自動打開
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(VOICE_OPEN_FAQ_EVENT, handler);
    return () => window.removeEventListener(VOICE_OPEN_FAQ_EVENT, handler);
  }, []);

  // 跨頁打開 — 從別頁說「打開 FAQ」會先 router.push("/admin") 並 set sessionStorage flag,
  // mount 後讀 flag 自動開、用完即清。
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(VOICE_OPEN_FAQ_SESSION_KEY) === "1") {
        sessionStorage.removeItem(VOICE_OPEN_FAQ_SESSION_KEY);
        // 等下個 tick 確保 modal 動畫順,而不是跟頁面 mount 撞在一起
        const id = setTimeout(() => setOpen(true), 120);
        return () => clearTimeout(id);
      }
    } catch {
      /* sessionStorage 不可用就略過 */
    }
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-md border border-cyan-500/50 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400 transition-colors whitespace-nowrap font-medium"
        title="海森堡服務說明 Q&A"
      >
        ❓ 服務 QA
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl my-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-6 py-4 border-b border-slate-800 sticky top-0 bg-slate-900 rounded-t-2xl z-10">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-100">
                    🏛 海森堡的算盤 · 服務 QA
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    常見問題與服務內部架構說明
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-slate-100 text-2xl leading-none px-2 py-1 rounded hover:bg-slate-800"
                  aria-label="關閉"
                >
                  ×
                </button>
              </div>
              {/* 搜尋 bar — 即時過濾 q / summary / keywords */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">
                  🔍
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜尋問題或關鍵字 — 語音、市調、桑基、海森堡…"
                  autoFocus
                  className="w-full pl-9 pr-9 py-2 text-sm bg-slate-950 border border-slate-700 focus:border-cyan-500 focus:outline-none rounded-lg text-slate-100 placeholder-slate-500"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 text-lg leading-none px-1.5 py-0.5 rounded hover:bg-slate-800"
                    aria-label="清空搜尋"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                <span>
                  {query.trim() ? (
                    filtered.length > 0 ? (
                      <>
                        <span className="text-cyan-300 font-semibold">
                          {filtered.length}
                        </span>{" "}
                        / {FAQ_ENTRIES.length} 筆符合
                      </>
                    ) : (
                      <span className="text-rose-300">沒找到符合的問答</span>
                    )
                  ) : (
                    <>共 {FAQ_ENTRIES.length} 筆問答</>
                  )}
                </span>
                <span className="text-slate-600">
                  Esc {query ? "清空" : "關閉"}
                </span>
              </div>
            </header>

            <div className="p-6 space-y-4">
              {filtered.length === 0 && (
                <div className="space-y-3">
                  <div className="text-center py-8 text-slate-500 text-sm">
                    <div className="text-3xl mb-2">🔭</div>
                    <div className="mb-1">
                      沒找到「
                      <span className="text-slate-300">{query}</span>
                      」相關的預設問答
                    </div>
                    <div className="text-xs text-slate-600">
                      試試:語音 / 受訪者 / 桑基 / 名字 / 利率,或讓 AI 直接回答
                    </div>
                  </div>

                  {/* AI fallback CTA / 結果 */}
                  {!aiAnswer && !aiLoading && !aiError && (
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => askAI(query)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/15 border border-violet-500/50 text-violet-200 hover:bg-violet-500/25 hover:border-violet-400 transition-colors font-medium text-sm"
                      >
                        🤖 讓 AI 即時回答「{query.slice(0, 24)}
                        {query.length > 24 ? "…" : ""}」
                      </button>
                      <div className="text-[10px] text-slate-500 mt-2">
                        會打一次 MiniMax-M2.5 API · 約 3-5 秒
                      </div>
                    </div>
                  )}

                  {aiLoading && (
                    <div className="border border-violet-500/40 bg-violet-500/5 rounded-xl p-4 text-sm text-slate-300">
                      <div className="flex items-center gap-2 text-violet-300 font-semibold mb-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                        AI 思考中…
                      </div>
                      <div className="text-xs text-slate-400">
                        正在問 MiniMax-M2.5:「{aiAskedQuery}」
                      </div>
                    </div>
                  )}

                  {aiError && (
                    <div className="border border-rose-500/40 bg-rose-500/5 rounded-xl p-4 text-sm">
                      <div className="text-rose-300 font-semibold mb-1">
                        ⚠ 失敗
                      </div>
                      <div className="text-slate-300 text-xs">{aiError}</div>
                      <button
                        type="button"
                        onClick={() => aiAskedQuery && askAI(aiAskedQuery)}
                        className="mt-2 text-xs px-2 py-1 rounded border border-rose-500/50 text-rose-300 hover:bg-rose-500/10"
                      >
                        重試
                      </button>
                    </div>
                  )}

                  {aiAnswer && (
                    <div className="border border-violet-500/40 bg-violet-500/5 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-violet-500/20 bg-violet-500/5">
                        <div className="text-[10px] uppercase tracking-wider text-violet-300 font-bold flex items-center gap-2">
                          🤖 AI 即時回答 · 非預存問答
                          <span className="text-slate-500 normal-case font-normal text-[10px]">
                            MiniMax-M2.5
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-100 mt-1">
                          Q. {aiAskedQuery}
                        </div>
                      </div>
                      <div className="px-4 py-3">
                        <div className="text-[13px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                          {aiAnswer}
                        </div>
                        <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-500">
                          ⓘ AI 即時生成,僅供參考。如需正式說明請查既有 FAQ 或 README。
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {filtered.map((entry) => {
                const expanded = expandedId === entry.id;
                return (
                  <article
                    key={entry.id}
                    className={`border rounded-xl transition-all ${
                      expanded
                        ? "border-cyan-500/40 bg-cyan-500/5"
                        : "border-slate-700 bg-slate-900/40"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(expanded ? null : entry.id)
                      }
                      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-800/30 rounded-xl"
                    >
                      <span className="text-cyan-400 text-sm font-bold shrink-0 mt-0.5">
                        Q
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-slate-100 leading-snug">
                          {entry.q}
                        </h3>
                        {!expanded && (
                          <p className="text-[12px] text-slate-400 mt-1.5 leading-relaxed">
                            {entry.summary}
                          </p>
                        )}
                      </div>
                      <span className="text-slate-500 text-xs shrink-0 mt-1">
                        {expanded ? "▴" : "▾"}
                      </span>
                    </button>

                    {expanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-slate-800/60">
                        <div className="flex items-start gap-3">
                          <span className="text-emerald-400 text-sm font-bold shrink-0 mt-0.5">
                            A
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-slate-300 leading-relaxed mb-3">
                              {entry.summary}
                            </p>
                            {entry.diagram && (
                              <div className="my-4 bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
                                  示意圖
                                </div>
                                {entry.diagram}
                              </div>
                            )}
                            <div className="mt-3">{entry.body}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <footer className="px-6 py-3 border-t border-slate-800 text-[10px] text-slate-500 text-center rounded-b-2xl bg-slate-900/60">
              想加新問題?直接編輯
              <code className="mx-1 text-cyan-400 bg-slate-950 px-1.5 py-0.5 rounded">
                components/ServiceFAQ.tsx
              </code>
              的 FAQ_ENTRIES
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * 「Hey Heisenberg」四道工序示意圖 — 縱向流程,第三道(LLM)突顯紫色。
 */
function VoicePipelineDiagram() {
  // 4 個 box stacked vertically + 麥克風 icon 在最上方
  const W = 600;
  const H = 540;
  const BOX_W = 360;
  const BOX_H = 76;
  const cx = W / 2;
  const startY = 40;
  const gap = 32;

  const stages = [
    {
      label: "① 語音 → 文字 (STT)",
      tech: "Web Speech API · 瀏覽器內建",
      annotation: "免費 · 本地 · 無 LLM",
      color: "#475569", // slate-600
      stroke: "#64748b",
      isLLM: false,
    },
    {
      label: "② 喚醒詞偵測",
      tech: 'Regex × 600+ 同音變體',
      annotation: "純前端 · 0ms · 無 LLM",
      color: "#475569",
      stroke: "#64748b",
      isLLM: false,
    },
    {
      label: "③ 意圖判讀",
      tech: "MiniMax-M2.5 LLM",
      annotation: "← 唯一打 LLM API",
      color: "#8b5cf6", // violet-500
      stroke: "#a78bfa",
      isLLM: true,
    },
    {
      label: "④ 動作執行",
      tech: "CustomEvent / Router",
      annotation: "路由 · UI 更新",
      color: "#475569",
      stroke: "#64748b",
      isLLM: false,
    },
  ];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* 麥克風起點 */}
      <text
        x={cx}
        y={26}
        fontSize={20}
        textAnchor="middle"
      >
        🎤
      </text>
      <text
        x={cx}
        y={44}
        fontSize={11}
        fill="#94a3b8"
        textAnchor="middle"
      >
        使用者語音
      </text>

      {stages.map((s, i) => {
        const y = startY + 30 + i * (BOX_H + gap);
        const x = cx - BOX_W / 2;
        return (
          <g key={i}>
            {/* 連接線(從上一個 box 底部到這個 box 頂部) */}
            {i === 0 ? (
              <line
                x1={cx}
                x2={cx}
                y1={48}
                y2={y - 4}
                stroke="#64748b"
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
              />
            ) : (
              <line
                x1={cx}
                x2={cx}
                y1={startY + 30 + (i - 1) * (BOX_H + gap) + BOX_H}
                y2={y - 4}
                stroke="#64748b"
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
              />
            )}

            {/* Box */}
            <rect
              x={x}
              y={y}
              width={BOX_W}
              height={BOX_H}
              rx={8}
              fill={s.isLLM ? `${s.color}33` : "#1e293b"}
              stroke={s.stroke}
              strokeWidth={s.isLLM ? 2 : 1}
            />
            <text
              x={x + 14}
              y={y + 22}
              fontSize={14}
              fontWeight={700}
              fill={s.isLLM ? "#c4b5fd" : "#e2e8f0"}
            >
              {s.label}
            </text>
            <text
              x={x + 14}
              y={y + 42}
              fontSize={12}
              fill={s.isLLM ? "#ddd6fe" : "#cbd5e1"}
            >
              {s.tech}
            </text>
            <text
              x={x + 14}
              y={y + 62}
              fontSize={11}
              fill={s.isLLM ? "#a78bfa" : "#64748b"}
              fontWeight={s.isLLM ? 600 : 400}
            >
              {s.annotation}
            </text>

            {/* 右側 LLM 標記 */}
            {s.isLLM && (
              <g>
                <rect
                  x={x + BOX_W - 70}
                  y={y + BOX_H / 2 - 12}
                  width={62}
                  height={24}
                  rx={12}
                  fill="#fde68a"
                />
                <text
                  x={x + BOX_W - 39}
                  y={y + BOX_H / 2 + 4}
                  fontSize={11}
                  fontWeight={700}
                  fill="#78350f"
                  textAnchor="middle"
                >
                  LLM
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* 箭頭 marker 定義 */}
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
        </marker>
      </defs>
    </svg>
  );
}

/** 受訪者池 3 條來源 → personas.json → agents */
function PersonasOriginDiagram() {
  return (
    <svg viewBox="0 0 600 320" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {/* 3 個來源 */}
      {[
        { x: 30, label: "① TS Seed", sub: "DEFAULT_PERSONAS\n11 位 baseline", color: "#3b82f6" },
        { x: 220, label: "② HackMD 同步", sub: "「人設設定」章節\nparseHackmdMarkdown()", color: "#a78bfa" },
        { x: 410, label: "③ Admin 手刻", sub: "/admin 編輯器\n單筆 CRUD", color: "#34d399" },
      ].map((s, i) => (
        <g key={i}>
          <rect x={s.x} y={30} width={160} height={64} rx={8} fill={`${s.color}22`} stroke={s.color} strokeWidth={1.5} />
          <text x={s.x + 80} y={52} fontSize={13} fontWeight={700} fill={s.color} textAnchor="middle">{s.label}</text>
          <text x={s.x + 80} y={72} fontSize={11} fill="#cbd5e1" textAnchor="middle">{s.sub.split("\n")[0]}</text>
          <text x={s.x + 80} y={87} fontSize={10} fill="#94a3b8" textAnchor="middle">{s.sub.split("\n")[1]}</text>
          {/* 箭頭 */}
          <line x1={s.x + 80} y1={94} x2={s.x + 80 + (300 - s.x - 80) * 0.5} y2={150} stroke="#64748b" strokeWidth={1.4} markerEnd="url(#arrow2)" />
        </g>
      ))}
      {/* 中間 personas.json */}
      <rect x={170} y={150} width={260} height={56} rx={8} fill="#fbbf2422" stroke="#fbbf24" strokeWidth={2} />
      <text x={300} y={172} fontSize={14} fontWeight={700} fill="#fbbf24" textAnchor="middle">data/personas.json</text>
      <text x={300} y={190} fontSize={11} fill="#cbd5e1" textAnchor="middle">最終 30 位人物池 (~22 KB)</text>
      {/* 箭頭 */}
      <line x1={300} y1={206} x2={300} y2={244} stroke="#64748b" strokeWidth={1.4} markerEnd="url(#arrow2)" />
      {/* 下方 agents */}
      <rect x={140} y={244} width={320} height={52} rx={8} fill="#06b6d433" stroke="#06b6d4" strokeWidth={1.5} />
      <text x={300} y={266} fontSize={13} fontWeight={700} fill="#06b6d4" textAnchor="middle">getPersonas() → Multi-Agent Pipeline</text>
      <text x={300} y={284} fontSize={10} fill="#94a3b8" textAnchor="middle">PM agent 出題 · 30 位 persona 平行訪談 · summary 彙整</text>

      <defs>
        <marker id="arrow2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
        </marker>
      </defs>
    </svg>
  );
}

/** 14 天 vs 90 秒 時間 / 成本對照(log-scale 視覺化用色塊) */
function TimeComparisonDiagram() {
  return (
    <svg viewBox="0 0 600 340" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {/* 標題 */}
      <text x={300} y={24} fontSize={14} fontWeight={700} fill="#cbd5e1" textAnchor="middle">時間與成本對照</text>

      {/* 傳統市調 — 紅色長條 */}
      <text x={30} y={60} fontSize={12} fontWeight={700} fill="#fb7185">📅 傳統市調</text>
      <text x={30} y={76} fontSize={11} fill="#94a3b8">14-21 天 · NT$ 5-20 萬</text>
      {/* 階段條 */}
      {[
        { x: 30, w: 100, label: "招募", color: "#fb7185" },
        { x: 132, w: 70, label: "排程", color: "#f97316" },
        { x: 204, w: 150, label: "1對1訪談", color: "#fbbf24" },
        { x: 356, w: 80, label: "逐字稿", color: "#fb923c" },
        { x: 438, w: 100, label: "分析報告", color: "#a78bfa" },
      ].map((s, i) => (
        <g key={i}>
          <rect x={s.x} y={88} width={s.w} height={32} rx={4} fill={`${s.color}55`} stroke={s.color} strokeWidth={1} />
          <text x={s.x + s.w / 2} y={108} fontSize={11} fill="#e2e8f0" textAnchor="middle">{s.label}</text>
        </g>
      ))}

      {/* VS 分隔線 */}
      <line x1={30} x2={570} y1={150} y2={150} stroke="#475569" strokeWidth={1} strokeDasharray="3 3" />
      <text x={300} y={144} fontSize={11} fill="#64748b" textAnchor="middle">▼ 把這 5 段 LLM 化 ▼</text>

      {/* 海森堡 — 綠色短條(同寬以利對照,但下方標小數字) */}
      <text x={30} y={186} fontSize={12} fontWeight={700} fill="#34d399">⚡ 海森堡的算盤</text>
      <text x={30} y={202} fontSize={11} fill="#94a3b8">90-150 秒 · NT$ 5-15</text>
      {[
        { x: 30, w: 60, label: "查池", color: "#06b6d4", time: "0.5s" },
        { x: 92, w: 95, label: "PM 出題", color: "#3b82f6", time: "10s" },
        { x: 189, w: 220, label: "30 位平行訪談", color: "#34d399", time: "75s" },
        { x: 411, w: 70, label: "summary", color: "#fbbf24", time: "12s" },
        { x: 483, w: 85, label: "出報告", color: "#a78bfa", time: "18s" },
      ].map((s, i) => (
        <g key={i}>
          <rect x={s.x} y={214} width={s.w} height={32} rx={4} fill={`${s.color}55`} stroke={s.color} strokeWidth={1} />
          <text x={s.x + s.w / 2} y={232} fontSize={11} fill="#e2e8f0" textAnchor="middle">{s.label}</text>
          <text x={s.x + s.w / 2} y={258} fontSize={10} fill="#64748b" textAnchor="middle">{s.time}</text>
        </g>
      ))}

      {/* 對照倍數 */}
      <rect x={150} y={280} width={300} height={42} rx={6} fill="#fbbf2422" stroke="#fbbf24" strokeWidth={1.5} />
      <text x={300} y={302} fontSize={13} fontWeight={700} fill="#fbbf24" textAnchor="middle">~ 13,000× 快 · ~ 10,000× 便宜</text>
      <text x={300} y={316} fontSize={10} fill="#94a3b8" textAnchor="middle">邊際成本 ≈ 0,單一 PM 一天可跑 50 輪概念可行性快測</text>
    </svg>
  );
}

/** 4 層人格差異化防線 stack 圖 */
function DiversityLayerDiagram() {
  const layers = [
    { label: "第 1 層", title: "Persona System Prompt", sub: "11 欄位整段塞 system,角色扮演基底", color: "#3b82f6" },
    { label: "第 2 層", title: "signatureStyle 講話指紋", sub: "招牌語助詞 / 比喻 (伍佰「來來來」)", color: "#a78bfa" },
    { label: "第 3 層", title: "Bundled JSON 上下文一致", sub: "一通電話 5 題 · 跨題自洽不打架", color: "#34d399" },
    { label: "第 4 層", title: "Bouncer 套話過濾", sub: "彙整前掃 LLM-flavor 套話", color: "#fbbf24" },
  ];
  return (
    <svg viewBox="0 0 600 380" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <text x={300} y={26} fontSize={14} fontWeight={700} fill="#cbd5e1" textAnchor="middle">人格差異化 4 層防線</text>
      <text x={300} y={44} fontSize={11} fill="#94a3b8" textAnchor="middle">每層針對一種 LLM 失敗模式</text>

      {layers.map((l, i) => (
        <g key={i}>
          <rect
            x={60}
            y={70 + i * 68}
            width={480}
            height={56}
            rx={8}
            fill={`${l.color}22`}
            stroke={l.color}
            strokeWidth={1.5}
          />
          <text x={80} y={94 + i * 68} fontSize={11} fontWeight={700} fill={l.color}>
            {l.label}
          </text>
          <text x={140} y={94 + i * 68} fontSize={13} fontWeight={700} fill="#e2e8f0">
            {l.title}
          </text>
          <text x={80} y={115 + i * 68} fontSize={11} fill="#94a3b8">
            {l.sub}
          </text>
        </g>
      ))}

      <text x={300} y={356} fontSize={10} fill="#64748b" textAnchor="middle">
        ↓ 4 層通過後送進 summary agent
      </text>
    </svg>
  );
}

/** 5 維雷達 → 公式 → 散佈點 */
function MathExplainabilityDiagram() {
  // 雷達五角 + 公式 box + 散佈點
  const cx = 110;
  const cy = 130;
  const r = 70;
  const axes = ["經濟壓力", "風險偏好", "數位熟練", "借貸需求", "信用狀態"];
  const points = axes.map((_, i) => {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });
  // sample fill — 75/45/60/70/55 for visual
  const vals = [75, 45, 60, 70, 55];
  const fillPts = axes.map((_, i) => {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const rr = (r * vals[i]) / 100;
    return [cx + Math.cos(angle) * rr, cy + Math.sin(angle) * rr];
  });

  return (
    <svg viewBox="0 0 600 300" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {/* 雷達 */}
      <polygon
        points={points.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="#475569"
        strokeWidth={1}
      />
      {points.map((p, i) => (
        <g key={i}>
          <line x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke="#475569" strokeWidth={0.5} />
          <text
            x={p[0] + (p[0] - cx) * 0.25}
            y={p[1] + (p[1] - cy) * 0.25 + 4}
            fontSize={10}
            fill="#94a3b8"
            textAnchor="middle"
          >
            {axes[i]}
          </text>
        </g>
      ))}
      <polygon
        points={fillPts.map((p) => p.join(",")).join(" ")}
        fill="#a78bfa55"
        stroke="#a78bfa"
        strokeWidth={1.5}
      />
      <text x={cx} y={cy - r - 14} fontSize={12} fontWeight={700} fill="#a78bfa" textAnchor="middle">
        5 維雷達分數
      </text>

      {/* 箭頭到公式 */}
      <line x1={200} x2={250} y1={150} y2={150} stroke="#64748b" strokeWidth={1.5} markerEnd="url(#arrow3)" />

      {/* 公式 box */}
      <rect x={250} y={70} width={220} height={160} rx={8} fill="#1e293b" stroke="#fbbf24" strokeWidth={1.5} />
      <text x={360} y={90} fontSize={12} fontWeight={700} fill="#fbbf24" textAnchor="middle">
        意願公式(信貸範例)
      </text>
      {[
        "intent = loanNeed × 0.4",
        "  + riskPref × 0.3",
        "  + (5 - 利率%) × 3",
        "  + (credit - 50) × 0.18",
        "  ± 壓力曲線",
        "→ 套 applyShocks(通膨/失業)",
      ].map((line, i) => (
        <text
          key={i}
          x={262}
          y={112 + i * 18}
          fontSize={11}
          fill="#cbd5e1"
          fontFamily="ui-monospace,monospace"
        >
          {line}
        </text>
      ))}

      {/* 箭頭到散佈點 */}
      <line x1={470} x2={510} y1={150} y2={150} stroke="#64748b" strokeWidth={1.5} markerEnd="url(#arrow3)" />

      {/* 散佈點示意 */}
      <text x={550} y={64} fontSize={11} fontWeight={700} fill="#34d399" textAnchor="middle">散佈圖一點</text>
      <circle cx={550} cy={150} r={10} fill="#34d399" fillOpacity={0.85} stroke="#0b1020" strokeWidth={1.5} />
      <text x={550} y={184} fontSize={10} fill="#94a3b8" textAnchor="middle">
        x = 經濟壓力
      </text>
      <text x={550} y={198} fontSize={10} fill="#94a3b8" textAnchor="middle">
        y = 意願度
      </text>

      <text x={300} y={272} fontSize={10} fill="#64748b" textAnchor="middle">
        全程無 LLM 黑箱 — 任何一格都能追到具體 regex 命中與加減分
      </text>

      <defs>
        <marker id="arrow3" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
        </marker>
      </defs>
    </svg>
  );
}

/** 量子坍縮 metaphor — 雲(疊加)→ 觀測 → 散點(坍縮) */
function HeisenbergMetaphorDiagram() {
  return (
    <svg viewBox="0 0 600 320" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <text x={300} y={24} fontSize={14} fontWeight={700} fill="#cbd5e1" textAnchor="middle">觀測前 vs 觀測後</text>

      {/* 左:疊加雲(observation 前) */}
      <text x={130} y={62} fontSize={12} fontWeight={700} fill="#c084fc" textAnchor="middle">
        ❓ 疊加態(未觀測)
      </text>
      <text x={130} y={80} fontSize={10} fill="#94a3b8" textAnchor="middle">
        30 位 persona 同時有多種可能回答
      </text>
      {/* 模糊雲 — 多個半透明圓 */}
      <ellipse cx={130} cy={170} rx={90} ry={70} fill="#c084fc15" stroke="#c084fc55" strokeWidth={1} strokeDasharray="2 3" />
      {Array.from({ length: 18 }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / 18 + i * 0.07;
        const rr = 25 + (i % 4) * 14;
        return (
          <circle
            key={i}
            cx={130 + Math.cos(angle) * rr}
            cy={170 + Math.sin(angle) * rr}
            r={3 + (i % 3)}
            fill="#c084fc"
            fillOpacity={0.25 + (i % 5) * 0.1}
          />
        );
      })}
      <text x={130} y={266} fontSize={10} fill="#94a3b8" textAnchor="middle">
        可能性同時存在,你看不見
      </text>

      {/* 中間 — 觀測動作 */}
      <text x={300} y={130} fontSize={12} fontWeight={700} fill="#fbbf24" textAnchor="middle">
        🔬 觀測動作
      </text>
      <text x={300} y={148} fontSize={10} fill="#94a3b8" textAnchor="middle">PM 提出問題</text>
      <text x={300} y={164} fontSize={10} fill="#94a3b8" textAnchor="middle">+ 撥算盤珠</text>
      <line x1={220} y1={170} x2={380} y2={170} stroke="#fbbf24" strokeWidth={2} markerEnd="url(#arrow4)" />
      <text x={300} y={196} fontSize={9} fill="#fbbf24" textAnchor="middle">
        ⚡ 坍縮
      </text>

      {/* 右:坍縮成散點 */}
      <text x={480} y={62} fontSize={12} fontWeight={700} fill="#34d399" textAnchor="middle">
        ✓ 觀測後(已坍縮)
      </text>
      <text x={480} y={80} fontSize={10} fill="#94a3b8" textAnchor="middle">
        每位 persona 給出具體回答
      </text>
      {/* 散佈圖框 */}
      <rect x={420} y={100} width={120} height={140} rx={4} fill="#0b1020" stroke="#475569" strokeWidth={1} />
      {/* 三條決策帶 */}
      <rect x={420} y={100} width={120} height={46} fill="#34d39920" />
      <rect x={420} y={146} width={120} height={46} fill="#fbbf2420" />
      <rect x={420} y={192} width={120} height={48} fill="#fb718520" />
      {/* 散點 */}
      {[
        { x: 450, y: 120, c: "#34d399" },
        { x: 478, y: 132, c: "#34d399" },
        { x: 510, y: 116, c: "#34d399" },
        { x: 460, y: 165, c: "#fbbf24" },
        { x: 500, y: 175, c: "#fbbf24" },
        { x: 482, y: 158, c: "#fbbf24" },
        { x: 470, y: 215, c: "#fb7185" },
        { x: 508, y: 222, c: "#fb7185" },
        { x: 490, y: 198, c: "#fb7185" },
      ].map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={p.c} fillOpacity={0.85} stroke="#0b1020" strokeWidth={0.8} />
      ))}
      <text x={480} y={266} fontSize={10} fill="#94a3b8" textAnchor="middle">
        願意 / 觀望 / 拒絕 三區
      </text>

      <text x={300} y={300} fontSize={10} fill="#64748b" textAnchor="middle">
        撥算盤珠(改利率/通膨/失業)→ 觀測場變 → 粒子重新坍縮位置 = 行為相變
      </text>

      <defs>
        <marker id="arrow4" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />
        </marker>
      </defs>
    </svg>
  );
}

/** 可信度三層信心建構 */
function CredibilityDiagram() {
  const layers = [
    { label: "③ 真人 calibration", sub: "上線前對 10 位真實外送員比對", color: "#fbbf24" },
    { label: "② 數字可審計", sub: "雷達 + 公式 + applyShocks 全部開源邏輯", color: "#34d399" },
    { label: "① 人格基底真實", sub: "HackMD 骨幹來自實際外送員訪談", color: "#60a5fa" },
  ];
  return (
    <svg viewBox="0 0 600 280" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <text x={300} y={26} fontSize={14} fontWeight={700} fill="#cbd5e1" textAnchor="middle">
        三層信心建構(由下往上)
      </text>
      {layers.map((l, i) => {
        const y = 60 + i * 60;
        const indent = i * 30;
        return (
          <g key={i}>
            <rect
              x={60 + indent}
              y={y}
              width={480 - indent * 2}
              height={48}
              rx={6}
              fill={`${l.color}22`}
              stroke={l.color}
              strokeWidth={1.5}
            />
            <text x={80 + indent} y={y + 22} fontSize={13} fontWeight={700} fill={l.color}>
              {l.label}
            </text>
            <text x={80 + indent} y={y + 40} fontSize={11} fill="#cbd5e1">
              {l.sub}
            </text>
          </g>
        );
      })}
      <text x={300} y={262} fontSize={10} fill="#64748b" textAnchor="middle">
        誠實標示:仍不能 100% 證明,但每層削減一種失真風險
      </text>
    </svg>
  );
}

/** 目標使用者 4 象限定位 */
function TargetUsersDiagram() {
  const quads = [
    { x: 60, y: 50, label: "✓ PM / 企劃", sub: "早期 idea validation\n一週跑 50 輪概念測試", color: "#34d399", main: true },
    { x: 320, y: 50, label: "✓ 行銷", sub: "桑基中間層分眾文案\n替代 30 天 A/B test", color: "#34d399", main: true },
    { x: 60, y: 180, label: "✓ 風控", sub: "shock 模擬找弱勢族\n預警逾期 / 設信用門檻", color: "#34d399", main: true },
    { x: 320, y: 180, label: "△ 通路", sub: "前期客群 briefing 工具\n仍需面對面深訪", color: "#fbbf24", main: false },
  ];
  return (
    <svg viewBox="0 0 600 340" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <text x={300} y={26} fontSize={14} fontWeight={700} fill="#cbd5e1" textAnchor="middle">
        四象限定位 — ✓ 主用戶 vs △ 輔助
      </text>
      {quads.map((q, i) => (
        <g key={i}>
          <rect
            x={q.x}
            y={q.y}
            width={220}
            height={110}
            rx={10}
            fill={`${q.color}${q.main ? "22" : "15"}`}
            stroke={q.color}
            strokeWidth={q.main ? 2 : 1.2}
            strokeDasharray={q.main ? undefined : "4 4"}
          />
          <text x={q.x + 16} y={q.y + 26} fontSize={14} fontWeight={700} fill={q.color}>
            {q.label}
          </text>
          {q.sub.split("\n").map((line, j) => (
            <text key={j} x={q.x + 16} y={q.y + 56 + j * 18} fontSize={11} fill="#cbd5e1">
              {line}
            </text>
          ))}
        </g>
      ))}
      <text x={300} y={325} fontSize={10} fill="#64748b" textAnchor="middle">
        不適合:終局 GTM 決策 / 法規敏感性訪談 / 純情感性深訪
      </text>
    </svg>
  );
}

/** 12 個月 roadmap 三階段 */
function RoadmapDiagram() {
  return (
    <svg viewBox="0 0 600 280" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <text x={300} y={26} fontSize={14} fontWeight={700} fill="#cbd5e1" textAnchor="middle">
        12 個月落地里程碑
      </text>

      {/* 時間軸 */}
      <line x1={40} x2={560} y1={70} y2={70} stroke="#475569" strokeWidth={2} />

      {/* 三階段節點 */}
      {[
        { x: 130, label: "1-3M", title: "MVP 驗證", sub: "真人 calibration\nLLM cache · 多語言", color: "#06b6d4" },
        { x: 300, label: "3-6M", title: "產品線試點", sub: "1-2 個事業單位\nB 端 SDK · 標準化", color: "#a78bfa" },
        { x: 470, label: "6-12M", title: "平台化 SaaS", sub: "多租戶 · RBAC\n接 CRM · BI 整合", color: "#fbbf24" },
      ].map((s, i) => (
        <g key={i}>
          {/* 節點圓 */}
          <circle cx={s.x} cy={70} r={10} fill={s.color} stroke="#0b1020" strokeWidth={2} />
          {/* label 上方 */}
          <text x={s.x} y={56} fontSize={11} fill={s.color} fontWeight={700} textAnchor="middle">
            {s.label}
          </text>
          {/* title 下方 */}
          <text x={s.x} y={100} fontSize={13} fontWeight={700} fill="#e2e8f0" textAnchor="middle">
            {s.title}
          </text>
          {s.sub.split("\n").map((line, j) => (
            <text
              key={j}
              x={s.x}
              y={120 + j * 16}
              fontSize={10}
              fill="#94a3b8"
              textAnchor="middle"
            >
              {line}
            </text>
          ))}
        </g>
      ))}

      {/* go/no-go gate 提示 */}
      <text x={300} y={200} fontSize={11} fill="#fbbf24" textAnchor="middle" fontWeight={600}>
        🚦 每階段設 go/no-go gate
      </text>
      <text x={300} y={220} fontSize={10} fill="#94a3b8" textAnchor="middle">
        calibration 誤差 &lt; 15% 才推中期 · 試點 ROI &gt; 8× 才推長期
      </text>
      <text x={300} y={258} fontSize={10} fill="#64748b" textAnchor="middle">
        每階段交付 + 評估,不下對賭
      </text>
    </svg>
  );
}

/** 計價 tier 對比表 */
function CostTierDiagram() {
  const tiers = [
    {
      x: 50,
      label: "FREE",
      price: "NT$ 0",
      quota: "5 次 / 月",
      target: "試水溫",
      color: "#64748b",
    },
    {
      x: 220,
      label: "PRO",
      price: "NT$ 999",
      quota: "100 次 / 月",
      target: "PM 個人版",
      color: "#a78bfa",
      featured: true,
    },
    {
      x: 390,
      label: "ENTERPRISE",
      price: "客製",
      quota: "不限次數",
      target: "部門整合",
      color: "#fbbf24",
    },
  ];
  return (
    <svg viewBox="0 0 600 260" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <text x={300} y={26} fontSize={14} fontWeight={700} fill="#cbd5e1" textAnchor="middle">
        建議商業化計價
      </text>

      {tiers.map((t, i) => (
        <g key={i}>
          <rect
            x={t.x}
            y={50}
            width={160}
            height={170}
            rx={10}
            fill={`${t.color}${t.featured ? "22" : "11"}`}
            stroke={t.color}
            strokeWidth={t.featured ? 2.5 : 1}
          />
          <text
            x={t.x + 80}
            y={74}
            fontSize={11}
            fontWeight={700}
            fill={t.color}
            textAnchor="middle"
          >
            {t.label}
          </text>
          <text
            x={t.x + 80}
            y={114}
            fontSize={22}
            fontWeight={800}
            fill="#e2e8f0"
            textAnchor="middle"
          >
            {t.price}
          </text>
          <text
            x={t.x + 80}
            y={144}
            fontSize={12}
            fill="#cbd5e1"
            textAnchor="middle"
          >
            {t.quota}
          </text>
          <text
            x={t.x + 80}
            y={170}
            fontSize={10}
            fill="#94a3b8"
            textAnchor="middle"
          >
            {t.target}
          </text>
          {t.featured && (
            <g>
              <rect x={t.x + 60} y={184} width={40} height={20} rx={10} fill={t.color} />
              <text
                x={t.x + 80}
                y={198}
                fontSize={10}
                fontWeight={700}
                fill="#0b1020"
                textAnchor="middle"
              >
                推薦
              </text>
            </g>
          )}
        </g>
      ))}

      {/* 對照真實市調 */}
      <line x1={40} x2={560} y1={235} y2={235} stroke="#475569" strokeWidth={0.5} strokeDasharray="2 2" />
      <text x={300} y={250} fontSize={10} fill="#64748b" textAnchor="middle">
        傳統 30 位深訪市調 NT$ 5-20 萬 · 海森堡省 10,000-40,000×
      </text>
    </svg>
  );
}

/** 三階段多單位擴張 funnel */
function ScalingDiagram() {
  return (
    <svg viewBox="0 0 600 320" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <text x={300} y={26} fontSize={14} fontWeight={700} fill="#cbd5e1" textAnchor="middle">
        多單位擴張路徑
      </text>

      {[
        {
          y: 50,
          label: "階段 1 · 內部分組",
          sub: "AUTH_USERS + tenant_id · 各組獨立 persona 池",
          when: "下個月",
          color: "#06b6d4",
        },
        {
          y: 130,
          label: "階段 2 · 公開介接",
          sub: "Open API · iframe embed · Webhook · SDK",
          when: "Q4",
          color: "#a78bfa",
        },
        {
          y: 210,
          label: "階段 3 · 多租戶 SaaS",
          sub: "RBAC · SSO · Audit log · 計費 dashboard",
          when: "2027",
          color: "#fbbf24",
        },
      ].map((s, i) => (
        <g key={i}>
          <rect
            x={60}
            y={s.y}
            width={480}
            height={60}
            rx={8}
            fill={`${s.color}22`}
            stroke={s.color}
            strokeWidth={1.5}
          />
          <text x={80} y={s.y + 24} fontSize={13} fontWeight={700} fill={s.color}>
            {s.label}
          </text>
          <text x={80} y={s.y + 46} fontSize={11} fill="#cbd5e1">
            {s.sub}
          </text>
          {/* 右側時間徽章 */}
          <rect
            x={460}
            y={s.y + 18}
            width={66}
            height={24}
            rx={12}
            fill={s.color}
            fillOpacity={0.35}
            stroke={s.color}
          />
          <text
            x={493}
            y={s.y + 34}
            fontSize={11}
            fontWeight={700}
            fill={s.color}
            textAnchor="middle"
          >
            {s.when}
          </text>
        </g>
      ))}

      <text x={300} y={300} fontSize={10} fill="#64748b" textAnchor="middle">
        架構預留:persona-store 可換 DB · auth 已預留 tenant 欄位
      </text>
    </svg>
  );
}

/** Live reactivity 三段事件流 — 滑桿 → 計算管線 → SVG 動畫 */
function ReactivityFlowDiagram() {
  return (
    <svg viewBox="0 0 600 360" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <text x={300} y={26} fontSize={14} fontWeight={700} fill="#cbd5e1" textAnchor="middle">
        即時反應鏈(從滑桿動 → 30 顆粒子重新坍縮)
      </text>

      {/* 三層橫向流程 */}
      {/* === Layer 1: 滑桿 → Context === */}
      <g>
        {/* Slider icon */}
        <rect x={40} y={62} width={140} height={62} rx={6} fill="#3b82f622" stroke="#3b82f6" strokeWidth={1.5} />
        <text x={110} y={80} fontSize={11} fontWeight={700} fill="#3b82f6" textAnchor="middle">① 使用者拖動</text>
        <text x={110} y={97} fontSize={10} fill="#cbd5e1" textAnchor="middle">利率 / 通膨 / 失業</text>
        <text x={110} y={114} fontSize={10} fill="#94a3b8" textAnchor="middle">&lt;input type=&quot;range&quot;&gt;</text>

        {/* Arrow */}
        <line x1={180} x2={224} y1={93} y2={93} stroke="#64748b" strokeWidth={1.5} markerEnd="url(#arr-react)" />
        <text x={202} y={86} fontSize={9} fill="#64748b" textAnchor="middle">onChange</text>

        {/* Context */}
        <rect x={224} y={62} width={156} height={62} rx={6} fill="#a78bfa22" stroke="#a78bfa" strokeWidth={1.5} />
        <text x={302} y={80} fontSize={11} fontWeight={700} fill="#a78bfa" textAnchor="middle">ProductParamsContext</text>
        <text x={302} y={97} fontSize={10} fill="#cbd5e1" textAnchor="middle">setParamValue / setShocks</text>
        <text x={302} y={114} fontSize={10} fill="#94a3b8" textAnchor="middle">廣播給所有 consumers</text>

        {/* Arrow */}
        <line x1={380} x2={424} y1={93} y2={93} stroke="#64748b" strokeWidth={1.5} markerEnd="url(#arr-react)" />
        <text x={402} y={86} fontSize={9} fill="#64748b" textAnchor="middle">re-render</text>

        {/* Consumers */}
        <rect x={424} y={62} width={140} height={62} rx={6} fill="#06b6d422" stroke="#06b6d4" strokeWidth={1.5} />
        <text x={494} y={80} fontSize={11} fontWeight={700} fill="#06b6d4" textAnchor="middle">面板 useMemo</text>
        <text x={494} y={97} fontSize={10} fill="#cbd5e1" textAnchor="middle">PhaseMap / Sankey</text>
        <text x={494} y={114} fontSize={10} fill="#94a3b8" textAnchor="middle">觸發重算</text>
      </g>

      {/* 向下箭頭 */}
      <line x1={300} x2={300} y1={130} y2={158} stroke="#64748b" strokeWidth={1.5} markerEnd="url(#arr-react)" />

      {/* === Layer 2: 三步驟計算管線 === */}
      <text x={300} y={154} fontSize={10} fill="#94a3b8" textAnchor="middle">↓ 對 30 位 persona 各跑一次 ↓</text>
      <g>
        <rect x={40} y={164} width={520} height={68} rx={8} fill="#10141a" stroke="#475569" strokeWidth={1} />
        <text x={300} y={184} fontSize={11} fontWeight={700} fill="#fbbf24" textAnchor="middle">
          ② 三步驟計算管線(每位 persona)
        </text>

        {/* Step 1 */}
        <rect x={56} y={196} width={150} height={28} rx={4} fill="#3b82f633" stroke="#3b82f6" />
        <text x={131} y={214} fontSize={11} fontWeight={600} fill="#bfdbfe" textAnchor="middle">
          computeRadarScores
        </text>
        <text x={131} y={222} fontSize={8} fill="#94a3b8" textAnchor="middle">(5 維雷達)</text>

        {/* Arrow */}
        <line x1={206} x2={224} y1={210} y2={210} stroke="#64748b" strokeWidth={1} markerEnd="url(#arr-react)" />

        {/* Step 2 */}
        <rect x={224} y={196} width={150} height={28} rx={4} fill="#a78bfa33" stroke="#a78bfa" />
        <text x={299} y={214} fontSize={11} fontWeight={600} fill="#ddd6fe" textAnchor="middle">
          computePurchaseIntent
        </text>
        <text x={299} y={222} fontSize={8} fill="#94a3b8" textAnchor="middle">(套產品公式)</text>

        {/* Arrow */}
        <line x1={374} x2={392} y1={210} y2={210} stroke="#64748b" strokeWidth={1} markerEnd="url(#arr-react)" />

        {/* Step 3 */}
        <rect x={392} y={196} width={150} height={28} rx={4} fill="#fbbf2433" stroke="#fbbf24" />
        <text x={467} y={214} fontSize={11} fontWeight={600} fill="#fde68a" textAnchor="middle">
          applyShocks
        </text>
        <text x={467} y={222} fontSize={8} fill="#94a3b8" textAnchor="middle">(通膨 / 失業)</text>
      </g>

      {/* 向下箭頭 */}
      <line x1={300} x2={300} y1={236} y2={264} stroke="#64748b" strokeWidth={1.5} markerEnd="url(#arr-react)" />

      {/* === Layer 3: SVG 屬性 + 動畫 === */}
      <text x={300} y={260} fontSize={10} fill="#94a3b8" textAnchor="middle">↓ 算出 final_intent → SVG render ↓</text>
      <g>
        <rect x={40} y={272} width={520} height={56} rx={8} fill="#34d39922" stroke="#34d399" strokeWidth={1.5} />
        <text x={300} y={290} fontSize={11} fontWeight={700} fill="#34d399" textAnchor="middle">
          ③ SVG circle 的 cy 屬性更新
        </text>
        <text x={300} y={307} fontSize={10} fill="#cbd5e1" textAnchor="middle">
          CSS: transition cy 700ms cubic-bezier(0.34, 1.56, 0.64, 1)
        </text>
        <text x={300} y={322} fontSize={10} fill="#94a3b8" textAnchor="middle">
          粒子用彈跳曲線滑到新位置 — 量子坍縮視覺感
        </text>
      </g>

      <text x={300} y={350} fontSize={10} fill="#64748b" textAnchor="middle">
        ⚡ 整段 &lt; 1ms · 滑桿動到定位 &lt; 50ms · 60 fps 順暢
      </text>

      <defs>
        <marker id="arr-react" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
        </marker>
      </defs>
    </svg>
  );
}

/** 整體服務架構 — 四層俯瞰圖,從輸入層往下到視覺化層 */
function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 600 440" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <text x={300} y={26} fontSize={14} fontWeight={700} fill="#cbd5e1" textAnchor="middle">
        4 層架構 — 越往下越接近確定性純函式
      </text>

      {/* === Layer 1: 輸入層 === */}
      <g>
        <rect x={40} y={50} width={520} height={68} rx={8} fill="#3b82f622" stroke="#3b82f6" strokeWidth={1.5} />
        <text x={300} y={70} fontSize={13} fontWeight={700} fill="#bfdbfe" textAnchor="middle">
          ① 輸入層 · Browser-First
        </text>
        {/* 三個入口 box */}
        <rect x={70} y={82} width={140} height={26} rx={4} fill="#1e3a8a55" stroke="#3b82f6" />
        <text x={140} y={100} fontSize={11} fill="#dbeafe" textAnchor="middle">💬 主對話 ( / )</text>
        <rect x={230} y={82} width={140} height={26} rx={4} fill="#1e3a8a55" stroke="#3b82f6" />
        <text x={300} y={100} fontSize={11} fill="#dbeafe" textAnchor="middle">🎤 語音控制</text>
        <rect x={390} y={82} width={140} height={26} rx={4} fill="#1e3a8a55" stroke="#3b82f6" />
        <text x={460} y={100} fontSize={11} fill="#dbeafe" textAnchor="middle">⚙ 人物設定 ( /admin )</text>
      </g>

      {/* 箭頭 1→2 */}
      <line x1={300} x2={300} y1={120} y2={138} stroke="#64748b" strokeWidth={1.5} markerEnd="url(#arr-arch)" />
      <text x={310} y={134} fontSize={9} fill="#64748b">SSE / REST</text>

      {/* === Layer 2: Agent Pipeline === */}
      <g>
        <rect x={40} y={144} width={520} height={86} rx={8} fill="#a78bfa22" stroke="#a78bfa" strokeWidth={1.5} />
        <text x={300} y={164} fontSize={13} fontWeight={700} fill="#ddd6fe" textAnchor="middle">
          ② Agent Pipeline 層 · 5 LLM agents · MiniMax-M2.5
        </text>
        {/* 5 個 agent */}
        {[
          { x: 56, label: "啟動者", sub: "entry", color: "#06b6d4" },
          { x: 158, label: "PM 出題", sub: "plan", color: "#a78bfa" },
          { x: 260, label: "對話者 ×30", sub: "parallel", color: "#34d399", highlight: true },
          { x: 376, label: "彙整者", sub: "summary", color: "#fbbf24" },
          { x: 478, label: "PM 報告", sub: "report", color: "#fb7185" },
        ].map((a, i) => (
          <g key={i}>
            <rect
              x={a.x}
              y={178}
              width={92}
              height={40}
              rx={5}
              fill={`${a.color}${a.highlight ? "44" : "22"}`}
              stroke={a.color}
              strokeWidth={a.highlight ? 2 : 1}
            />
            <text x={a.x + 46} y={196} fontSize={11} fontWeight={700} fill={a.color} textAnchor="middle">
              {a.label}
            </text>
            <text x={a.x + 46} y={210} fontSize={9} fill="#94a3b8" textAnchor="middle">
              {a.sub}
            </text>
            {/* 串接小箭頭 */}
            {i < 4 && (
              <line
                x1={a.x + 92}
                x2={a.x + 102}
                y1={198}
                y2={198}
                stroke="#64748b"
                strokeWidth={1}
                markerEnd="url(#arr-arch)"
              />
            )}
          </g>
        ))}
      </g>

      {/* 箭頭 2→3 */}
      <line x1={300} x2={300} y1={232} y2={250} stroke="#64748b" strokeWidth={1.5} markerEnd="url(#arr-arch)" />
      <text x={314} y={246} fontSize={9} fill="#64748b">JSON 答案</text>

      {/* === Layer 3: 計算層 === */}
      <g>
        <rect x={40} y={256} width={520} height={68} rx={8} fill="#34d39922" stroke="#34d399" strokeWidth={1.5} />
        <text x={300} y={276} fontSize={13} fontWeight={700} fill="#86efac" textAnchor="middle">
          ③ 計算層 · 純函式 · 無 LLM 黑箱
        </text>
        {[
          { x: 56, label: "computeRadarScores", sub: "5 維雷達" },
          { x: 188, label: "computePurchaseIntent", sub: "意願公式" },
          { x: 332, label: "applyShocks", sub: "通膨/失業" },
          { x: 444, label: "buildThreeLayerFlows", sub: "桑基聚合" },
        ].map((f, i) => (
          <g key={i}>
            <rect
              x={f.x}
              y={288}
              width={108}
              height={28}
              rx={4}
              fill="#065f4655"
              stroke="#34d399"
              strokeWidth={0.8}
            />
            <text
              x={f.x + 54}
              y={302}
              fontSize={9}
              fontWeight={700}
              fill="#86efac"
              textAnchor="middle"
              fontFamily="ui-monospace,monospace"
            >
              {f.label}
            </text>
            <text x={f.x + 54} y={313} fontSize={9} fill="#94a3b8" textAnchor="middle">
              {f.sub}
            </text>
          </g>
        ))}
      </g>

      {/* 箭頭 3→4 */}
      <line x1={300} x2={300} y1={326} y2={344} stroke="#64748b" strokeWidth={1.5} markerEnd="url(#arr-arch)" />
      <text x={319} y={340} fontSize={9} fill="#64748b">座標 / 絲帶寬</text>

      {/* === Layer 4: 視覺化 === */}
      <g>
        <rect x={40} y={350} width={520} height={68} rx={8} fill="#fbbf2422" stroke="#fbbf24" strokeWidth={1.5} />
        <text x={300} y={370} fontSize={13} fontWeight={700} fill="#fde68a" textAnchor="middle">
          ④ 視覺化層 · SVG-Native(無 D3 / Chart.js)
        </text>
        {[
          { x: 56, label: "📊 散佈圖" },
          { x: 188, label: "🌊 三層桑基" },
          { x: 320, label: "📄 報告卡" },
          { x: 444, label: "🧮 AbacusBar" },
        ].map((v, i) => (
          <g key={i}>
            <rect x={v.x} y={382} width={108} height={26} rx={4} fill="#78350f55" stroke="#fbbf24" strokeWidth={0.8} />
            <text x={v.x + 54} y={400} fontSize={11} fontWeight={600} fill="#fde68a" textAnchor="middle">
              {v.label}
            </text>
          </g>
        ))}
      </g>

      <defs>
        <marker
          id="arr-arch"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
        </marker>
      </defs>
    </svg>
  );
}

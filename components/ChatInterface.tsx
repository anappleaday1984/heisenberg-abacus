"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AgentName, ChatMessage, StreamEvent } from "@/lib/agents/types";
import { usePersonaSession } from "@/lib/persona-session-context";
import { LoginButton } from "./LoginButton";
import { MessageBubble, type DisplayMessage } from "./MessageBubble";
import { PersonaQAExplorer } from "./PersonaQAExplorer";
import { PipelineStatus, type PipelineStage } from "./PipelineStatus";
import { QueryResponseBubble } from "./QueryResponseBubble";
import { ReportCard } from "./ReportCard";
import { SpectrumSwitcher } from "./SpectrumSwitcher";
import { SummaryCard } from "./SummaryCard";

let nextId = 0;
const newId = () => `msg-${++nextId}`;

const PRODUCT_EXAMPLES = [
  {
    icon: "💰",
    name: "微型信貸",
    desc: "5 萬短期借款 · 6.88% 利率 · 30 秒撥款",
    prompt:
      "我想測試一個給外送員的微型信貸新方案：5 萬元額度、年利率 6.88%、30 秒線上審核撥款、還款期 6 個月。請幫我做市場調查，了解外送員對這個方案的接受度、痛點，以及什麼條件會讓他們放棄申請。",
  },
  {
    icon: "🛡",
    name: "保險",
    desc: "外送員專屬意外險 · 月付 199",
    prompt:
      "我想測試一個外送員專屬的微型意外險：月付 199 元，跑單時段（每天 6 小時內）發生車禍最高理賠 100 萬，住院日額 2,000 元，純線上投保 1 分鐘完成。請幫我做市場調查，了解外送員會不會買、價格敏感度、有什麼附加保障最吸引他們。",
  },
  {
    icon: "💳",
    name: "信用卡",
    desc: "外送員聯名卡 · 油錢 5% 餐飲 3% 回饋",
    prompt:
      "我想測試一張外送員聯名信用卡：加油 5% 現金回饋（無上限）、外送平台消費 3% 回饋、年費 0 元但需綁定外送平台帳號。請幫我做市場調查，了解外送員的興趣、會不會替換現有信用卡、有沒有隱藏顧慮。",
  },
];

export function ChatInterface() {
  const session = usePersonaSession();
  // Chat 訊息與「展開洞察」狀態交給 session context — 在 / 與 /simulation 之間切換時保留
  const messages = session.messages;
  const setMessages = session.setMessages;
  const showInsights = session.showInsights;
  const setShowInsights = session.setShowInsights;

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [personaCount, setPersonaCount] = useState(0);
  const [stage, setStage] = useState<PipelineStage>("idle");
  const [stageDetail, setStageDetail] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<DisplayMessage[]>([]);
  messagesRef.current = messages;

  // === 偵測「已完成調查」狀態 → bar 切到查詢模式 ===
  // 條件：有任何 qa explorer 訊息（含完整問題 + 受訪者答案）+ 沒在跑流程中
  const lastQa = [...messages]
    .reverse()
    .find((m) => m.role === "qa" && m.qaQuestions && m.qaEntries);
  const isPostChat = !busy && !!lastQa;

  // 提交查詢（不跑完整 pipeline，只問 LLM 從現有資料找答案）
  async function handleQuery(query: string) {
    if (!lastQa?.qaQuestions || !lastQa?.qaEntries) return;

    const userMsg: DisplayMessage = { id: newId(), role: "user", text: query };
    const queryMsgId = newId();
    setMessages((m) => [
      ...m,
      userMsg,
      { id: queryMsgId, role: "query", text: "", streaming: true },
    ]);
    setBusy(true);

    try {
      const res = await fetch("/api/chat/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          questions: lastQa.qaQuestions,
          entries: lastQa.qaEntries,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Query 失敗: HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6).trim());
            if (ev.delta) {
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === queryMsgId
                    ? { ...msg, text: msg.text + ev.delta }
                    : msg
                )
              );
            } else if (ev.error) {
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === queryMsgId
                    ? { ...msg, text: `⚠️ ${ev.error}`, streaming: false }
                    : msg
                )
              );
            }
          } catch {
            /* skip malformed line */
          }
        }
      }
      setMessages((m) =>
        m.map((msg) =>
          msg.id === queryMsgId ? { ...msg, streaming: false } : msg
        )
      );
    } catch (err) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === queryMsgId
            ? {
                ...msg,
                text: `⚠️ ${err instanceof Error ? err.message : String(err)}`,
                streaming: false,
              }
            : msg
        )
      );
    } finally {
      setBusy(false);
    }
  }

  // 重啟 — 清除所有訊息、重置 pipeline 狀態，回到初始空白頁
  function restartSession() {
    session.reset(); // 清 messages、showInsights、personas、qaEntries
    setInput("");
    setBusy(false);
    setPersonaCount(0);
    setStage("idle");
    setStageDetail("");
  }

  // 提供給 PersonaQAExplorer 的「跳到洞察報告」callback
  function jumpToSummary() {
    setShowInsights(true);
    // 等下一個 frame 讓卡片掛上 DOM 再 scroll
    requestAnimationFrame(() => {
      setTimeout(() => {
        const summaryMsg = messagesRef.current.find(
          (m) => m.role === "agent" && m.agent === "summary"
        );
        if (summaryMsg) {
          const el = document.getElementById(`msg-${summaryMsg.id}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
          }
        }
        // 還沒生成完 — 捲到底
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 80);
    });
  }

  // 把 agent_start 對應到 pipeline stage
  function eventToStage(
    agent: AgentName,
    label?: string
  ): { stage: PipelineStage; detail: string } | null {
    if (agent === "entry") return { stage: "entry", detail: "解析需求中" };
    if (agent === "pm" && label === "規劃調查")
      return { stage: "pm-plan", detail: "設計訪談問題" };
    if (agent === "persona")
      return { stage: "persona", detail: label ?? "" };
    if (agent === "summary")
      return { stage: "summary", detail: "歸納共識與分歧" };
    if (agent === "pm" && label === "回報結果")
      return { stage: "pm-report", detail: "生成決策報告" };
    return null;
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    // 已完成調查 → 切到查詢模式（不跑完整 pipeline）
    if (isPostChat) {
      setInput("");
      await handleQuery(text);
      return;
    }

    const userMsg: DisplayMessage = {
      id: newId(),
      role: "user",
      text,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);
    setStage("entry");
    setStageDetail("解析需求中");
    setShowInsights(false); // 新一輪 chat：重置「已展開洞察報告」狀態

    // Build history: include user messages + entry/pm replies so the entry
    // agent can see what it asked previously when the user follows up.
    const history: ChatMessage[] = messages
      .filter(
        (m) => m.role === "user" || m.agent === "entry" || m.agent === "pm"
      )
      .map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.text,
      }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, message: text }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Track active streaming bubble per (agent + label) combo
      const activeKey = (a: AgentName, l?: string) => `${a}|${l ?? ""}`;
      const activeMap = new Map<string, string>(); // key -> messageId

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;

          let event: StreamEvent;
          try {
            event = JSON.parse(json);
          } catch {
            continue;
          }

          if (event.type === "agent_start") {
            // Track persona count for the SummaryCard footer
            if (event.agent === "persona" && event.label) {
              const m = event.label.match(/(\d+)\s*位/);
              if (m) setPersonaCount(Number(m[1]));
            }
            // Update pipeline stage indicator
            const next = eventToStage(event.agent, event.label);
            if (next) {
              setStage(next.stage);
              setStageDetail(next.detail);
            }
            const key = activeKey(event.agent, event.label);
            const id = newId();
            activeMap.set(key, id);
            setMessages((m) => [
              ...m,
              {
                id,
                role: "agent",
                agent: event.agent,
                label: event.label,
                text: "",
                streaming: true,
              },
            ]);
          } else if (event.type === "personas_intro") {
            // 「人格顯影」— 推到 session（給模擬艙用），訊息流插入「光譜指標切換」
            session.setPersonas(event.personas, event.productContext);
            setMessages((m) => [
              ...m,
              {
                id: newId(),
                role: "phase-map",
                text: event.productContext ?? "",
                personas: event.personas,
              },
            ]);
          } else if (event.type === "personas_qa") {
            // 訪談完成 — 推到 session（讓桑基圖在模擬艙呈現），訊息流只留 Q&A explorer
            session.setQA(event.questions, event.entries);
            setMessages((m) => [
              ...m,
              {
                id: newId(),
                role: "qa",
                text: "",
                qaQuestions: event.questions,
                qaEntries: event.entries,
              },
            ]);
          } else if (event.type === "agent_text") {
            const key = activeKey(event.agent, event.label);
            const id = activeMap.get(key);
            if (id) {
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === id ? { ...msg, text: msg.text + event.text } : msg
                )
              );
            } else {
              // No active bubble — create one (for parallel personas)
              const newBubbleId = newId();
              activeMap.set(key, newBubbleId);
              setMessages((m) => [
                ...m,
                {
                  id: newBubbleId,
                  role: "agent",
                  agent: event.agent,
                  label: event.label,
                  text: event.text,
                  streaming: true,
                },
              ]);
            }
          } else if (event.type === "agent_done") {
            const key = activeKey(event.agent, event.label);
            const id = activeMap.get(key);
            if (id) {
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === id ? { ...msg, streaming: false } : msg
                )
              );
              activeMap.delete(key);
            }
          } else if (event.type === "error") {
            setMessages((m) => [
              ...m,
              {
                id: newId(),
                role: "agent",
                agent: "entry",
                label: "錯誤",
                text: `⚠️ ${event.message}`,
              },
            ]);
          } else if (event.type === "complete") {
            setStage("complete");
            setStageDetail("");
          }
        }
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: newId(),
          role: "agent",
          agent: "entry",
          label: "錯誤",
          text: `⚠️ 連線失敗：${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full max-w-4xl w-full mx-auto">
      <header className="px-6 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">
            海森堡的算盤 · 人類行為觀測站
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Multi-agent virtual persona market research
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LoginButton />
          <Link
            href="/simulation"
            title="模擬艙 — 行為相變散佈圖、外在變因下的意象變化"
            className="text-sm text-violet-300 hover:text-violet-100 border border-violet-500/50 hover:border-violet-400 hover:bg-violet-500/10 rounded-md px-3 py-1.5 whitespace-nowrap font-medium transition"
          >
            🛰 模擬艙
          </Link>
          <Link
            href="/admin"
            className="text-sm text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded-md px-3 py-1.5 whitespace-nowrap"
          >
            ⚙ 人物設定
          </Link>
          <button
            type="button"
            onClick={restartSession}
            title="清除所有訊息、重置 pipeline、回到初始狀態"
            className="text-sm text-orange-300/90 hover:text-orange-200 border border-orange-500/40 hover:border-orange-400 hover:bg-orange-500/10 rounded-md px-3 py-1.5 whitespace-nowrap font-medium transition"
          >
            ↻ 重啟
          </button>
        </div>
      </header>

      {/* === 進度欄 — 固定區塊（占自己空間，不蓋其他內容） === */}
      {(stage !== "idle" || messages.length > 0) && (
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/70 backdrop-blur-sm shrink-0">
          <div className="max-w-4xl mx-auto">
            <PipelineStatus stage={stage} detail={stageDetail} />
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="mt-12 space-y-6">
            <div className="text-center space-y-1">
              <p className="text-sm text-slate-400">
                輸入你想做的市場調查，或從以下產品範例開始：
              </p>
              <p className="text-xs text-slate-500">
                點擊範例會自動填入提問框，可在送出前修改
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl mx-auto">
              {PRODUCT_EXAMPLES.map((ex) => (
                <button
                  key={ex.name}
                  type="button"
                  onClick={() => setInput(ex.prompt)}
                  disabled={busy}
                  className="bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700 hover:border-blue-500 rounded-xl p-4 text-left transition disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <div className="text-2xl mb-1.5">{ex.icon}</div>
                  <div className="text-sm font-semibold text-slate-100 group-hover:text-blue-300">
                    {ex.name}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 leading-snug">
                    {ex.desc}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-2">
                    新類型開發中產品
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => {
          let content: React.ReactNode;
          if (msg.role === "query") {
            content = (
              <QueryResponseBubble
                text={msg.text}
                streaming={msg.streaming}
                onPickOption={(opt) => {
                  if (busy) return;
                  handleQuery(opt);
                }}
              />
            );
          } else if (msg.role === "phase-map" && msg.personas) {
            content = (
              <SpectrumSwitcher
                personas={msg.personas}
                productContext={msg.text}
              />
            );
          } else if (msg.role === "qa" && msg.qaQuestions && msg.qaEntries) {
            content = (
              <PersonaQAExplorer
                questions={msg.qaQuestions}
                entries={msg.qaEntries}
                onJumpToSummary={jumpToSummary}
              />
            );
          } else if (msg.role === "agent" && msg.agent === "summary") {
            // 等使用者在 PersonaQAExplorer 點「看洞察報告」才顯示
            if (!showInsights) return null;
            content = (
              <SummaryCard
                text={msg.text}
                streaming={msg.streaming}
                personaCount={personaCount}
              />
            );
          } else if (
            msg.role === "agent" &&
            msg.agent === "pm" &&
            msg.label === "回報結果"
          ) {
            // 同樣需要使用者展開
            if (!showInsights) return null;
            content = (
              <ReportCard text={msg.text} streaming={msg.streaming} />
            );
          } else {
            content = <MessageBubble msg={msg} />;
          }
          return (
            <div key={msg.id} id={`msg-${msg.id}`} className="scroll-mt-24">
              {content}
            </div>
          );
        })}
      </div>

      <form
        onSubmit={handleSubmit}
        className="px-6 py-4 border-t border-slate-800 flex gap-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            busy
              ? "處理中..."
              : isPostChat
              ? "查詢調查結果（例：我想看老王對所有問題的回覆 / 大家對 Q3 怎麼看 / 誰最有興趣）"
              : "請描述你想做的市場調查"
          }
          disabled={busy}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-2.5 rounded-lg font-medium transition"
        >
          送出
        </button>
      </form>
    </div>
  );
}

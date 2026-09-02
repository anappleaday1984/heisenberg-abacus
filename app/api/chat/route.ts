import { cookies } from "next/headers";
import { orchestrate } from "@/lib/orchestrator";
import type { ChatMessage } from "@/lib/agents/types";
import { toTraditional } from "@/lib/agents/zh-convert";
import { findUserByAccount, SESSION_COOKIE_NAME } from "@/lib/auth";
import { appendLog } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 必須登入才能使用 chat 服務
  const session = cookies().get(SESSION_COOKIE_NAME)?.value;
  const user = session ? findUserByAccount(session) : null;
  if (!user) {
    return new Response(
      JSON.stringify({ error: "請先登入後再使用此服務" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const body = (await req.json()) as {
    history: ChatMessage[];
    message: string;
  };

  const encoder = new TextEncoder();
  const startedAt = new Date();
  const startMs = Date.now();

  // Capture metadata for the log entry
  let personaCount = 0;
  let pmReportText = ""; // final agent's report — best summary candidate
  let summaryAgentText = ""; // fallback if PM report isn't reached
  let errorMsg: string | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      // SSE 心跳 — PM 規劃/彙總/產報告這幾段是「一個大 await 打到底」，
      // 中間可能好幾十秒到幾分鐘完全沒有 orchestrate() 事件可傳。多人併發時
      // 排隊更久，空窗期更長，中間層（瀏覽器 fetch idle timeout、代理、
      // ngrok）容易誤判連線已死而斷開，即使後端其實還在正常運算。
      // 每 15 秒送一個 SSE comment（`:` 開頭）維持連線有位元組流動；瀏覽器端
      // EventSource/fetch reader 會自動忽略 comment 行，不影響任何事件處理。
      // 純粹是額外的心跳位元組，跟 orchestrate() 的實際耗時完全無關、不會
      // 拖慢或阻塞任何 LLM 呼叫。
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // stream 已關閉就忽略（clearInterval 會在 finally 處理，這裡只是保險）
        }
      }, 15000);

      try {
        for await (const event of orchestrate(body.history, body.message)) {
          // 簡體→繁體轉換
          const safeEvent =
            event.type === "agent_text"
              ? { ...event, text: toTraditional(event.text) }
              : event;

          // Track metadata for log
          if (
            safeEvent.type === "agent_start" &&
            safeEvent.agent === "persona" &&
            safeEvent.label
          ) {
            const m = safeEvent.label.match(/(\d+)\s*位/);
            if (m) personaCount = Number(m[1]);
          }
          if (safeEvent.type === "agent_text") {
            if (
              safeEvent.agent === "pm" &&
              safeEvent.label === "PM 回報結果"
            ) {
              pmReportText += safeEvent.text;
            } else if (safeEvent.agent === "summary") {
              summaryAgentText += safeEvent.text;
            }
          }
          if (safeEvent.type === "error") {
            errorMsg = safeEvent.message;
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(safeEvent)}\n\n`)
          );
        }
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              message: errorMsg,
            })}\n\n`
          )
        );
      } finally {
        clearInterval(heartbeat);
        controller.close();

        // 寫入 log（不影響 stream 關閉）
        try {
          const summary = pmReportText.trim() || summaryAgentText.trim() || "";
          appendLog({
            startedAt,
            durationMs: Date.now() - startMs,
            prompt: body.message,
            personaCount,
            summary: summary.slice(0, 1500),
            success: !errorMsg,
            error: errorMsg,
          });
        } catch (logErr) {
          console.error("[logger] 寫 log 失敗:", logErr);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

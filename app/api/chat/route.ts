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

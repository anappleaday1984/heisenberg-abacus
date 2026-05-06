import { cookies } from "next/headers";
import { queryStream } from "@/lib/agents/query";
import { findUserByAccount, SESSION_COOKIE_NAME } from "@/lib/auth";
import { toTraditional } from "@/lib/agents/zh-convert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  query: string;
  questions: string[];
  entries: {
    persona: { archetype: string; name: string };
    answers: string[];
  }[];
};

export async function POST(req: Request) {
  // 必須登入
  const session = cookies().get(SESSION_COOKIE_NAME)?.value;
  const user = session ? findUserByAccount(session) : null;
  if (!user) {
    return new Response(
      JSON.stringify({ error: "請先登入後再使用此服務" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = (await req.json()) as Body;
  if (!body.query?.trim() || !body.questions?.length || !body.entries?.length) {
    return new Response(
      JSON.stringify({ error: "缺少必要欄位 (query / questions / entries)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of queryStream(
          body.query,
          body.questions,
          body.entries
        )) {
          // 簡→繁 兜底轉換
          const safeDelta = toTraditional(delta);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ delta: safeDelta })}\n\n`)
          );
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
        );
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            })}\n\n`
          )
        );
      } finally {
        controller.close();
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

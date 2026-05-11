import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { detectVoiceIntent } from "@/lib/agents/voice-intent";
import { findUserByAccount, SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  transcript?: string;
};

export async function POST(req: Request) {
  const session = cookies().get(SESSION_COOKIE_NAME)?.value;
  const user = session ? findUserByAccount(session) : null;
  if (!user) {
    return NextResponse.json(
      { error: "請先登入後再使用語音控制" },
      { status: 401 }
    );
  }

  const { transcript } = (await req.json()) as Body;
  if (!transcript || !transcript.trim()) {
    return NextResponse.json(
      { error: "transcript 為必填" },
      { status: 400 }
    );
  }

  try {
    const intent = await detectVoiceIntent(transcript);
    return NextResponse.json(intent);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

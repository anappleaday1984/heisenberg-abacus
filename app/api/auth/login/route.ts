import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  appendAuthLog,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  toPublic,
  tryActivateSession,
  validateCredentials,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { account?: string; password?: string };
  const account = body.account?.trim();
  const password = body.password ?? "";

  if (!account || !password) {
    return NextResponse.json(
      { error: "請輸入帳號與密碼" },
      { status: 400 }
    );
  }

  const user = validateCredentials(account, password);
  if (!user) {
    return NextResponse.json(
      { error: "帳號或密碼錯誤" },
      { status: 401 }
    );
  }

  // 同時上線人數檢查
  const activation = tryActivateSession(user);
  if (!activation.ok) {
    return NextResponse.json(
      { error: activation.error, activeCount: activation.active.length },
      { status: 429 }
    );
  }

  cookies().set(SESSION_COOKIE_NAME, user.account, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  appendAuthLog({
    timestamp: new Date().toISOString(),
    event: "login",
    account: user.account,
    name: user.name,
    role: user.role,
  });

  return NextResponse.json({ user: toPublic(user) });
}

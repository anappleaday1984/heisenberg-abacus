import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  findUserByAccount,
  listActiveSessions,
  MAX_CONCURRENT_USERS,
  SESSION_COOKIE_NAME,
  toPublic,
  touchSession,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!session) {
    return NextResponse.json({
      user: null,
      activeCount: listActiveSessions().length,
      maxConcurrent: MAX_CONCURRENT_USERS,
    });
  }
  const user = findUserByAccount(session);
  if (user) {
    // 確認該 account 仍在 active 名單內 — 若被 inactivity 踢掉就視為已登出
    const active = listActiveSessions();
    const stillActive = active.some((s) => s.account === user.account);
    if (!stillActive) {
      // server 端已 expire，前端 cookie 還在 — 回 user=null 觸發重新登入
      cookies().delete(SESSION_COOKIE_NAME);
      return NextResponse.json({
        user: null,
        activeCount: active.length,
        maxConcurrent: MAX_CONCURRENT_USERS,
      });
    }
    touchSession(user.account);
  }
  return NextResponse.json({
    user: user ? toPublic(user) : null,
    activeCount: listActiveSessions().length,
    maxConcurrent: MAX_CONCURRENT_USERS,
  });
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  appendAuthLog,
  deactivateSession,
  findUserByAccount,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (session) {
    const user = findUserByAccount(session);
    if (user) {
      deactivateSession(user.account);
      appendAuthLog({
        timestamp: new Date().toISOString(),
        event: "logout",
        account: user.account,
        name: user.name,
        role: user.role,
      });
    }
  }
  cookies().delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import {
  HACKMD_PAGE_URL,
  fetchPersonasFromHackmd,
  savePersonas,
} from "@/lib/personas-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 從 HackMD 重新載入人設設定。
 * 預設：fetch + parse + 儲存（覆蓋目前 personas.json）。
 * 若 query 帶 ?dryRun=1，只回傳解析結果不儲存。
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  try {
    const personas = await fetchPersonasFromHackmd();
    if (!dryRun) savePersonas(personas);

    return NextResponse.json({
      ok: true,
      source: HACKMD_PAGE_URL,
      count: personas.length,
      dryRun,
      personas,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}

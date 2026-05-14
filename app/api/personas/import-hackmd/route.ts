import { NextResponse } from "next/server";
import {
  HACKMD_PAGE_URL,
  PERSONA_SECTIONS,
  DEFAULT_PERSONA_SECTION,
  fetchPersonasFromHackmd,
  savePersonas,
  type PersonaSectionKey,
} from "@/lib/personas-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 從 HackMD 重新載入人設設定。
 * 預設：fetch + parse + 儲存（覆蓋目前 personas.json）。
 * - `?section=v1|v2` 指定章節 (預設 v1 外送員)
 * - `?dryRun=1` 只回傳解析結果不儲存。
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  // section param: v1 / v2 (預設 v1)
  const sectionRaw = url.searchParams.get("section");
  const section: PersonaSectionKey =
    sectionRaw === "v1" || sectionRaw === "v2"
      ? sectionRaw
      : DEFAULT_PERSONA_SECTION;

  try {
    const personas = await fetchPersonasFromHackmd(section);
    if (!dryRun) savePersonas(personas);

    return NextResponse.json({
      ok: true,
      source: HACKMD_PAGE_URL,
      section,
      sectionTitle: PERSONA_SECTIONS[section].title,
      sectionLabel: PERSONA_SECTIONS[section].label,
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

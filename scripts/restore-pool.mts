/**
 * 還原 personas pool。
 *
 *   npx tsx scripts/restore-pool.mts         # 從 HackMD 拉完整 30 位
 *   npx tsx scripts/restore-pool.mts --default  # 用 DEFAULT_PERSONAS (10 位)
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const useDefault = process.argv.includes("--default");

let personas: Array<{ id: string; archetype: string; name: string }> = [];

if (useDefault) {
  const m = (await import("../lib/agents/personas-data.ts")) as unknown as Record<string, unknown>;
  personas =
    ((m.DEFAULT_PERSONAS ?? (m.default as { DEFAULT_PERSONAS?: unknown[] })?.DEFAULT_PERSONAS) as typeof personas) ?? [];
} else {
  const m = (await import("../lib/personas-store.ts")) as unknown as Record<string, unknown>;
  const fetchFn = (m.fetchPersonasFromHackmd ?? (m.default as { fetchPersonasFromHackmd?: () => Promise<unknown> })?.fetchPersonasFromHackmd) as
    | (() => Promise<typeof personas>)
    | undefined;
  if (!fetchFn) {
    console.error("✗ 無法載入 fetchPersonasFromHackmd");
    process.exit(1);
  }
  console.log("→ 從 HackMD 抓 personas (full pool)…");
  personas = await fetchFn();
}

if (!personas.length) {
  console.error("✗ 抓到 0 位 — 跳出");
  process.exit(1);
}

const out = join(process.cwd(), "data", "personas.json");
writeFileSync(out, JSON.stringify(personas, null, 2), "utf-8");
console.log(`✓ pool restored: ${personas.length} personas`);
for (const p of personas) {
  console.log(`  - ${p.id} : ${p.archetype} · ${p.name}`);
}

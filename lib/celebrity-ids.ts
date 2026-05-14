/**
 * 名人 persona ID 集合 — UI 顯示時要做模糊處理(避免清楚顯示真人臉部),
 * 跟 scripts/generate-portraits.mjs 的 CELEBRITY_LIKENESS map 對齊。
 */
export const CELEBRITY_IDS: ReadonlySet<string> = new Set([
  "nv_jensen_true", // 黃仁勳
  "chin_blue_500", // 伍佰
  "mizuki_official", // 林襄
  "greg_han_01", // 許光漢
  "persona_motn8zh9", // 法拉利姊
  "persona_motn96at", // 胡漢龑(吊車大王)
]);

/**
 * 把 `_v2` 後綴剝掉,讓 v2 上班族 persona 共用 v1 同 archetype 的 portrait 與
 * 名人判定(v2 是 v1 的職業變體,人物本身相同,沒必要再產一套圖)。
 *
 *   "uncle_zealot_v2"     → "uncle_zealot"
 *   "nv_jensen_true_v2"   → "nv_jensen_true"
 *   "uncle_zealot"        → "uncle_zealot"  (no-op)
 */
export function resolvePortraitId(personaId: string): string {
  return personaId.endsWith("_v2") ? personaId.slice(0, -3) : personaId;
}

export function isCelebrity(personaId: string): boolean {
  return CELEBRITY_IDS.has(resolvePortraitId(personaId));
}

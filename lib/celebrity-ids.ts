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

export function isCelebrity(personaId: string): boolean {
  return CELEBRITY_IDS.has(personaId);
}

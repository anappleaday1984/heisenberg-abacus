import type { Persona } from "./agents/personas-data";

export type RadarScores = {
  economicPressure: number; // 經濟壓力
  riskPreference: number; // 風險偏好
  digitalFluency: number; // 數位熟練度
  loanNeed: number; // 借貸需求度
  creditStatus: number; // 信用狀態
};

export const RADAR_DIMENSIONS: Array<{ key: keyof RadarScores; label: string }> =
  [
    { key: "economicPressure", label: "經濟壓力" },
    { key: "riskPreference", label: "風險偏好" },
    { key: "digitalFluency", label: "數位熟練度" },
    { key: "loanNeed", label: "借貸需求" },
    { key: "creditStatus", label: "信用狀態" },
  ];

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * 從 Persona 欄位推算五維分數（0-100）。純啟發式 — 用關鍵字 + 數值 + 年齡組合，
 * 目的是讓不同人設在 radar 上拉出可辨識的形狀差異，提供 demo 用視覺強度。
 */
export function computeRadarScores(p: Persona): RadarScores {
  const text = `${p.personality} ${p.family} ${p.assetsAndEvents}`;

  // ---- 經濟壓力 ----
  let economicPressure = ((1_200_000 - p.yearlyIncomeTWD) / 1_200_000) * 80;
  if (/撫養|扶養|贍養|養.*孩|養.*家|負擔|支柱/.test(p.family)) {
    economicPressure += 25;
  }
  if (/失業|破產|卡債|遲繳|被罰/.test(text)) {
    economicPressure += 15;
  }
  if (/包租|定存|不動產|大樓/.test(text)) {
    economicPressure -= 30;
  }
  economicPressure = clamp(economicPressure);

  // ---- 風險偏好 ----
  // 年輕基底高、年長基底低
  let riskPreference = Math.max(20, 110 - p.age * 1.4);
  if (/創業|投資|股市|加密|斜槓|追求|夢想|改裝/.test(text)) {
    riskPreference += 20;
  }
  if (/保守|穩定|定存|謹慎|細心|認真|注重SOP/.test(text)) {
    riskPreference -= 20;
  }
  if (/破產|信用|遲繳|怕|擔心/.test(text)) {
    riskPreference -= 12;
  }
  riskPreference = clamp(riskPreference);

  // ---- 數位熟練度 ----
  let digitalFluency = Math.max(15, 105 - (p.age - 18) * 1.7);
  if (/工程師|科技|電腦|剪輯|新創|遊牧|APP|軟體/.test(text)) {
    digitalFluency += 18;
  }
  if (/熱血|改裝|敏銳|效率/.test(text)) {
    digitalFluency += 6;
  }
  if (/退休|傳統|工廠領班|樂活/.test(text)) {
    digitalFluency -= 18;
  }
  digitalFluency = clamp(digitalFluency);

  // ---- 借貸需求度 ----
  let loanNeed = 45;
  if (/撫養|扶養|贍養/.test(p.family)) loanNeed += 18;
  if (p.yearlyIncomeTWD < 400_000) loanNeed += 22;
  else if (p.yearlyIncomeTWD < 700_000) loanNeed += 8;
  if (/破產|卡債|信貸|還債|套牢/.test(text)) loanNeed += 18;
  if (/創業|遊學|旅遊基金|存錢/.test(text)) loanNeed += 10;
  if (/包租|定存|股市|無貸款|無經濟負擔/.test(text)) loanNeed -= 35;
  loanNeed = clamp(loanNeed);

  // ---- 信用狀態 ----
  let creditStatus = 60;
  if (/包租|定存|股市|無貸款|電梯大樓|公寓/.test(text)) creditStatus += 30;
  if (/科技|工程師|公務員|正職/.test(text)) creditStatus += 8;
  if (/破產|卡債|遲繳/.test(text)) creditStatus -= 55;
  if (/信用空白|被拒|信用瑕疵/.test(text)) creditStatus -= 18;
  if (/年金|退休/.test(text)) creditStatus += 10;
  creditStatus = clamp(creditStatus);

  return {
    economicPressure,
    riskPreference,
    digitalFluency,
    loanNeed,
    creditStatus,
  };
}

// 10 色 palette — 給 radar 中每位 persona 不同顏色
const PALETTE = [
  "#60a5fa", // blue
  "#a78bfa", // violet
  "#34d399", // emerald
  "#fbbf24", // amber
  "#fb7185", // rose
  "#22d3ee", // cyan
  "#e879f9", // fuchsia
  "#2dd4bf", // teal
  "#fb923c", // orange
  "#a3e635", // lime
  "#f87171", // red
  "#facc15", // yellow
  "#818cf8", // indigo
  "#4ade80", // green
  "#f472b6", // pink
];

/**
 * 產品類型 — 決定算盤滑桿要拉哪個變數
 */
export type ProductType = "loan" | "insurance" | "creditcard";

/**
 * 產品參數 — 給散佈圖的「算盤珠子」滑桿用。
 */
export type ProductParams =
  | { type: "loan"; interestRate: number } // 年利率 %
  | { type: "insurance"; monthlyFee: number } // 月費（元）
  | { type: "creditcard"; cashbackRate: number }; // 主要回饋率 %

/**
 * 從使用者問題（或 PM 計畫文）自動推斷產品類型
 */
export function detectProductType(context: string): ProductType {
  if (/信用卡|聯名卡|刷卡|現金回饋|哩程|簽帳|回饋|油錢[\s%回]/.test(context)) {
    return "creditcard";
  }
  if (/保險|意外險|醫療險|理賠|保費|住院|車險|人身險/.test(context)) {
    return "insurance";
  }
  return "loan";
}

const PRODUCT_LABEL: Record<ProductType, string> = {
  loan: "信貸",
  insurance: "保險",
  creditcard: "信用卡",
};
export const productLabel = (t: ProductType) => PRODUCT_LABEL[t];

/**
 * 推算單一受訪者在給定參數下的「購買意願度」(0-100)。
 * 三種產品類型各有不同的核心驅動因子：
 *   - 信貸：低利率推升、高利率打壓
 *   - 保險：低月費推升 + 經濟壓力族需求高 + 健康/家庭責任有關
 *   - 信用卡：高回饋推升 + 數位熟練度有關
 */
export function computePurchaseIntent(
  scores: RadarScores,
  params: ProductParams
): number {
  // 共用基底
  let intent = scores.loanNeed * 0.4 + scores.riskPreference * 0.3;

  if (params.type === "loan") {
    // 利率敏感度（5% 中性）
    intent += (params.interestRate - 5) * -3;
    // 信用狀態：差 = 怕被拒
    intent += (scores.creditStatus - 50) * 0.18;
    // 經濟壓力曲線
    if (scores.economicPressure > 80) intent -= 15;
    else if (scores.economicPressure > 50) intent += 6;
    intent += (scores.digitalFluency - 50) * 0.05;
  } else if (params.type === "insurance") {
    // 月費敏感度（200 元中性，每多 100 元 -5 intent）
    intent += (200 - params.monthlyFee) / 20;
    // 改成「家庭責任 + 經濟壓力」推動：有家有責任的人更需要保險
    intent += scores.economicPressure * 0.15; // 高壓力族更需保
    // 但太窮買不起
    if (scores.economicPressure > 85) intent -= 18;
    // 信用無關保險，不加分
    intent += (scores.digitalFluency - 50) * 0.08;
  } else {
    // creditcard
    // 回饋率敏感（3% 中性，每多 1% +10）
    intent += (params.cashbackRate - 3) * 10;
    // 信用越好越容易核卡 → 意願較高
    intent += (scores.creditStatus - 50) * 0.3;
    // 數位熟練度推升（要會用 app、線上消費）
    intent += (scores.digitalFluency - 50) * 0.25;
    // 經濟壓力過高的會擔心循環利息
    if (scores.economicPressure > 75) intent -= 12;
  }

  return Math.max(0, Math.min(100, Math.round(intent)));
}

export function colorForPersona(id: string, index: number): string {
  // 用 index 為主、id 為輔（讓 N>15 的 persona 還是有色）
  if (index < PALETTE.length) return PALETTE[index];
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

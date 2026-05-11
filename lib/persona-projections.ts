/**
 * 三維模擬空間的計算層 — 利率 × 客群特徵 × 外部環境(通膨 + 失業)。
 *
 * 提供面板共用的純函式:
 *   - buildSweetSpotCurve  — 收益 × 滲透率 trade-off (目前未使用,保留 API)
 *   - projectCLV           — 10 年留存與累積貢獻
 *   - applyShocks          — 對 intent 套用通膨 / 失業扣分
 *
 * 全部用既有的 computeRadarScores + computePurchaseIntent 當基底,
 * 模擬參數(本金 / margin / 留存率衰減)使用 demo 級啟發式公式 — 數量級對、形狀對,
 * 但不是精算或財務報表,讓決策者「看 trade-off 形狀」而不是當財務數字使用。
 */
import type { Persona } from "./agents/personas-data";
import {
  computePurchaseIntent,
  computeRadarScores,
  type ProductParams,
  type RadarScores,
} from "./persona-scores";

// ---------- 收益 × 滲透率甜蜜點 ----------

export type SweetSpotPoint = {
  rate: number; // 滑桿值(loan=利率%, insurance=月費元, creditcard=回饋%)
  customers: number; // 會購買的人數
  penetration: number; // 0-100
  perCustomerProfit: number; // 每戶年貢獻(NTD)
  totalRevenue: number; // 全年總收益(NTD)
};

export type SweetSpotCurve = {
  points: SweetSpotPoint[];
  optimalIdx: number; // 總收益最大的 index
  currentIdx: number; // 目前 paramValue 對應的 index
  maxRevenue: number;
  maxPenetration: number;
};

/**
 * 從一筆 ProductParams 構造出在指定 rate 的新 params(只換主要參數)。
 */
function paramsAt(base: ProductParams, value: number): ProductParams {
  if (base.type === "loan") return { type: "loan", interestRate: value };
  if (base.type === "insurance") return { type: "insurance", monthlyFee: value };
  return { type: "creditcard", cashbackRate: value };
}

/**
 * 單一受訪者在某參數下的「年貢獻 NTD」估計 — 不是精算,僅供 trade-off 形狀。
 *
 *   loan:    本金 ≈ 年薪 × 2 × (0.6 + loanNeed/250),margin = (利率 - 1.5%)
 *   insure:  月費 × 12 × 0.3 (margin)
 *   credit:  年消費 ≈ 年薪 × 0.4,margin = (interchange 1.5% - cashback)
 */
function profitPerCustomer(
  p: Persona,
  scores: RadarScores,
  params: ProductParams
): number {
  if (params.type === "loan") {
    const principal = p.yearlyIncomeTWD * 2 * (0.6 + scores.loanNeed / 250);
    const margin = (params.interestRate - 1.5) / 100;
    return Math.max(0, principal * margin);
  }
  if (params.type === "insurance") {
    return params.monthlyFee * 12 * 0.3;
  }
  // creditcard
  const avgSpend = p.yearlyIncomeTWD * 0.4;
  const margin = 0.015 - params.cashbackRate / 100;
  return Math.max(0, avgSpend * margin);
}

export function buildSweetSpotCurve(
  personas: Persona[],
  params: ProductParams,
  config: { min: number; max: number },
  steps: number = 28,
  shocks: ShockState = NO_SHOCKS
): SweetSpotCurve {
  // 預先 cache 每位 persona 的 scores,sweep 不重算
  const cached = personas.map((p) => ({ p, scores: computeRadarScores(p) }));
  const stepSize = (config.max - config.min) / steps;
  const points: SweetSpotPoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const rate = config.min + i * stepSize;
    const localParams = paramsAt(params, rate);
    let customers = 0;
    let totalRevenue = 0;
    for (const { p, scores } of cached) {
      const baseIntent = computePurchaseIntent(scores, localParams);
      const intent = applyShocks(baseIntent, scores, shocks);
      if (intent >= 60) {
        customers++;
        totalRevenue += profitPerCustomer(p, scores, localParams);
      }
    }
    const penetration = (customers / personas.length) * 100;
    const perCustomerProfit = customers > 0 ? totalRevenue / customers : 0;
    points.push({
      rate,
      customers,
      penetration,
      perCustomerProfit,
      totalRevenue,
    });
  }

  // 找總收益最高 + 找目前 paramValue 對應的 index
  let optimalIdx = 0;
  let maxRevenue = 0;
  let maxPenetration = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i].totalRevenue > maxRevenue) {
      maxRevenue = points[i].totalRevenue;
      optimalIdx = i;
    }
    if (points[i].penetration > maxPenetration) {
      maxPenetration = points[i].penetration;
    }
  }
  // currentIdx: 找最接近 paramValue 的點
  const currentValue =
    params.type === "loan"
      ? params.interestRate
      : params.type === "insurance"
        ? params.monthlyFee
        : params.cashbackRate;
  let currentIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = Math.abs(points[i].rate - currentValue);
    if (d < bestDist) {
      bestDist = d;
      currentIdx = i;
    }
  }

  return { points, optimalIdx, currentIdx, maxRevenue, maxPenetration };
}

// ---------- CLV — 客戶生命週期 10 年模擬 ----------

export type CLVYearPoint = {
  year: number; // 1..10
  activeCustomers: number; // 該年仍續用的人數(浮點期望值)
  yearlyRevenue: number; // 該年貢獻
  cumulativeRevenue: number; // 累積到該年的總貢獻
};

export type CLVProjection = {
  yearly: CLVYearPoint[];
  initialCustomers: number;
  totalCLV: number;
  avgRetention: number; // 加權平均年留存率(%)
};

/**
 * 留存率啟發式 — 信用越好留越久、經濟壓力越大流失越快。
 * 範圍夾在 0.65..0.95,避免 demo 出現 50% 或 99% 這種極端數字。
 */
function annualRetention(scores: RadarScores): number {
  let r = 0.85;
  r += (scores.creditStatus - 50) * 0.0018;
  r -= (scores.economicPressure - 50) * 0.0018;
  return Math.max(0.65, Math.min(0.95, r));
}

export function projectCLV(
  personas: Persona[],
  params: ProductParams,
  years: number = 10,
  shocks: ShockState = NO_SHOCKS
): CLVProjection {
  const yearly: CLVYearPoint[] = [];
  // 初始 cohort = 在當前 params 下會購買的 persona
  type Cohort = {
    p: Persona;
    scores: RadarScores;
    retention: number;
    yearlyValue: number;
  };
  const cohort: Cohort[] = [];
  for (const p of personas) {
    const scores = computeRadarScores(p);
    const baseIntent = computePurchaseIntent(scores, params);
    const intent = applyShocks(baseIntent, scores, shocks);
    if (intent < 60) continue;
    cohort.push({
      p,
      scores,
      retention: annualRetention(scores),
      yearlyValue: profitPerCustomer(p, scores, params),
    });
  }

  let cumulative = 0;
  let totalRetentionWeighted = 0;
  let totalActivePersonYears = 0;
  for (let y = 1; y <= years; y++) {
    let active = 0;
    let yearlyRev = 0;
    for (const c of cohort) {
      const surv = Math.pow(c.retention, y - 1); // 第 1 年 = 1.0,第 10 年 = retention^9
      active += surv;
      yearlyRev += c.yearlyValue * surv;
      totalRetentionWeighted += surv * c.retention;
      totalActivePersonYears += surv;
    }
    cumulative += yearlyRev;
    yearly.push({
      year: y,
      activeCustomers: active,
      yearlyRevenue: yearlyRev,
      cumulativeRevenue: cumulative,
    });
  }

  const avgRetention =
    totalActivePersonYears > 0
      ? (totalRetentionWeighted / totalActivePersonYears) * 100
      : 0;

  return {
    yearly,
    initialCustomers: cohort.length,
    totalCLV: cumulative,
    avgRetention,
  };
}

// ---------- 外部衝擊 ----------

export type ShockState = {
  inflation: number; // 0-10 (%)
  unemployment: number; // 2-15 (%)
};

/**
 * Shock-adjusted 意願度 — 在原 intent 上扣分。共用工具,給散佈圖 / 桑基 / CLV
 * 全部一起套,這樣同一份 shocks 設定下所有面板的「臨界點」會一致移動。
 *
 *   通膨   → 高經濟壓力族扣更多(已經很緊還變貴)
 *   失業   → 信用 + 經濟壓力雙弱族扣最多(沒緩衝)
 *
 * multiplier 預設 1.0,保留參數方便日後加上季節 / 月份權重。
 */
export function applyShocks(
  baseIntent: number,
  scores: RadarScores,
  shocks: ShockState,
  multiplier: number = 1
): number {
  const inflationHit =
    (shocks.inflation / 10) * Math.max(0, scores.economicPressure - 40) * 0.45;
  const unemploymentHit =
    (shocks.unemployment / 15) *
    Math.max(0, 50 - scores.creditStatus) *
    0.4 *
    (scores.economicPressure / 80 + 0.3);
  const total = (inflationHit + unemploymentHit) * multiplier;
  return Math.max(0, Math.min(100, baseIntent - total));
}

export const NO_SHOCKS: ShockState = {
  inflation: 0,
  unemployment: 0,
};

/**
 * 預設外部衝擊 — 接近 2026 年台灣實際數字(通膨 ~3%、失業 ~4%),
 * 讓使用者打開 demo 就看到「真實環境」下的臨界點,而不是無衝擊的樂觀情境。
 */
export const DEFAULT_SHOCKS: ShockState = {
  inflation: 3,
  unemployment: 4,
};

// ---------- 工具 ----------

/**
 * NTD 簡寫 — 1_500_000 → "150 萬"、12_000_000 → "1,200 萬"、>=億 → "X.XX 億"。
 * 給 chart axis label / 數字標籤用,避免 1234567 的長串。
 */
export function formatTWD(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)} 億`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()} 萬`;
  return `${Math.round(n).toLocaleString()}`;
}

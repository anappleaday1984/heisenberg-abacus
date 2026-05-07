import type { ProductType } from "./persona-scores";

export type SliderConfig = {
  type: ProductType | "open";
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
  presets: number[];
  icon: string;
  desc: string;
};

/**
 * 開放式問題（沒有明確金融產品）的通用「情境壓力」滑桿。
 * 0-100 代表外在變因強度 — 拉高 → 受訪者行為相變。
 */
export const OPEN_SLIDER_CONFIG: SliderConfig = {
  type: "open",
  label: "情境變因",
  unit: "%",
  min: 0,
  max: 100,
  step: 1,
  default: 50,
  presets: [10, 30, 50, 70, 90],
  icon: "🌐",
  desc: "外在變因強度 → 客群行為相變",
};

const DRINK_SLIDER_CONFIG: SliderConfig = {
  type: "open",
  label: "飲料定價",
  unit: "元",
  min: 0,
  max: 200,
  step: 5,
  default: 60,
  presets: [30, 60, 90, 120, 180],
  icon: "🥤",
  desc: "價格往上 → 客群減少嘗試",
};

const MEAL_SLIDER_CONFIG: SliderConfig = {
  type: "open",
  label: "餐點定價",
  unit: "元",
  min: 0,
  max: 500,
  step: 10,
  default: 150,
  presets: [60, 120, 180, 280, 400],
  icon: "🍱",
  desc: "價格往上 → 客群轉向替代方案",
};

const GENERIC_PRICE_SLIDER_CONFIG: SliderConfig = {
  type: "open",
  label: "定價",
  unit: "元",
  min: 0,
  max: 1000,
  step: 10,
  default: 200,
  presets: [50, 100, 200, 500, 800],
  icon: "💵",
  desc: "價格往上 → 客群行為相變",
};

/**
 * 依問題語境決定開放模式的算盤珠 — 飲料/餐點/泛價格 → 元；其餘 → 百分比。
 */
export function resolveOpenSliderConfig(context: string): SliderConfig {
  const c = context ?? "";
  if (/飲料|手搖|手摇|咖啡|奶茶|拿鐵|拿铁|果汁|茶飲|茶饮|飲品|飲品|含糖|無糖|無糖飲|杯飲/.test(c)) {
    return DRINK_SLIDER_CONFIG;
  }
  if (/便當|便当|餐點|餐点|套餐|早餐|午餐|晚餐|宵夜|外送|外帶|外带/.test(c)) {
    return MEAL_SLIDER_CONFIG;
  }
  if (/價格|价格|價位|价位|售價|售价|定價|定价|價錢|价钱|多少錢|多少钱|幾元|几元|幾百|幾千|塊錢|塊/.test(c)) {
    return GENERIC_PRICE_SLIDER_CONFIG;
  }
  return OPEN_SLIDER_CONFIG;
}

export const SLIDER_CONFIGS: Record<ProductType, SliderConfig> = {
  loan: {
    type: "loan",
    label: "年利率",
    unit: "%",
    min: 0,
    max: 20,
    step: 0.01,
    default: 6.88,
    presets: [0.88, 6.88, 12.88, 18],
    icon: "💰",
    desc: "信貸 · 利率往上 → 客群放棄",
  },
  insurance: {
    type: "insurance",
    label: "月費",
    unit: "元/月",
    min: 0,
    max: 1000,
    step: 10,
    default: 199,
    presets: [99, 199, 399, 699],
    icon: "🛡",
    desc: "保險 · 保費調漲 → 弱勢族群退場",
  },
  creditcard: {
    type: "creditcard",
    label: "主要回饋率",
    unit: "%",
    min: 0,
    max: 10,
    step: 0.1,
    default: 5,
    presets: [1, 3, 5, 8],
    icon: "💳",
    desc: "信用卡 · 回饋拉高 → 觸發辦卡意願",
  },
};

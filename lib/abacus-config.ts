import type { ProductType } from "./persona-scores";

export type SliderConfig = {
  type: ProductType;
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

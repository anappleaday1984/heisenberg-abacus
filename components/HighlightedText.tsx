"use client";

import React from "react";

// 外送員 / 跑單族專屬術語 — 命中時用 highlight badge 標起來
// 排序：長字串先放，避免短字 prefix 蓋掉長字（ex 跑單 vs 跑外送）
const DELIVERY_TERMS = [
  "跑外送",
  "高峰時段",
  "尖峰時段",
  "平台抽成",
  "五星評價",
  "客訴",
  "顧路",
  "跑單",
  "派單",
  "接單",
  "送錯",
  "差評",
  "回家單",
  "油錢",
  "爆胎",
  "跑車",
  "保養",
  "尖峰",
  "外送員",
  "外送",
  "雨天",
  "巷子",
  "電動機車",
  "機車",
] as const;

// 把多個 term 合成一個 regex（保留群組分割原始位置）
const TERM_REGEX = new RegExp(`(${DELIVERY_TERMS.join("|")})`, "g");

type Props = {
  text: string;
  /** 是否高亮術語，預設 true */
  highlight?: boolean;
};

/**
 * 顯示文字並把外送員專屬術語用 mark 包起來（不影響原排版／空白）。
 */
export function HighlightedText({ text, highlight = true }: Props) {
  if (!highlight) {
    return <>{text}</>;
  }

  // 分段並對每段套 regex
  const parts = text.split(TERM_REGEX);

  return (
    <>
      {parts.map((part, i) => {
        // 在 split 中，匹配的字串會落在奇數 index（與群組相符）
        if (i % 2 === 1 && DELIVERY_TERMS.includes(part as (typeof DELIVERY_TERMS)[number])) {
          return (
            <mark
              key={i}
              className="bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 rounded px-1 py-px mx-px font-medium"
              title="外送員專屬術語"
            >
              {part}
            </mark>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

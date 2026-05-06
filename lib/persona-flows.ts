import type { Persona } from "./agents/personas-data";

// ---- 關鍵字桶 ----（受訪者文字裡命中其中之一就算屬於此桶）
export const KEYWORD_BUCKETS: Record<string, string[]> = {
  "🛵 機車與工作": [
    "機車",
    "電動機車",
    "油錢",
    "爆胎",
    "維修",
    "保養",
    "顧路",
    "跑單",
    "跑外送",
    "外送員",
    "平台抽成",
    "派單",
    "接單",
    "高峰時段",
    "尖峰時段",
  ],
  "👨‍👩‍👧 家庭與責任": [
    "撫養",
    "扶養",
    "贍養",
    "小孩",
    "孩子",
    "學費",
    "老婆",
    "丈夫",
    "媽媽",
    "父母",
    "家人",
    "養家",
    "家庭",
    "孝親費",
  ],
  "💸 信用與債務": [
    "信用",
    "卡債",
    "信貸",
    "貸款",
    "破產",
    "還債",
    "套牢",
    "循環利息",
    "遲繳",
  ],
  "📈 投資與儲蓄": [
    "投資",
    "股市",
    "ETF",
    "加密",
    "存錢",
    "儲蓄",
    "創業",
    "週轉",
    "定存",
    "資產",
  ],
  "🏥 健康與意外": [
    "生病",
    "健康",
    "受傷",
    "車禍",
    "住院",
    "心血管",
    "慢性病",
    "意外",
  ],
};

// ---- 決策桶 ----
export type DecisionKey = "願意" | "觀望" | "拒絕";

export const DECISION_BUCKETS: Record<
  DecisionKey,
  { color: string; keywords: string[] }
> = {
  願意: {
    color: "#34d399", // emerald
    keywords: [
      "會買",
      "會考慮",
      "一定會",
      "心動",
      "會辦",
      "想試試",
      "可以",
      "願意",
      "吸引",
      "不錯",
      "值得",
      "划算",
      "有機會",
      "會去",
    ],
  },
  觀望: {
    color: "#fbbf24", // amber
    keywords: [
      "可能會",
      "可能",
      "也許",
      "看狀況",
      "再看看",
      "考慮看看",
      "再想想",
      "不一定",
      "看情況",
      "或許",
    ],
  },
  拒絕: {
    color: "#fb7185", // rose
    keywords: [
      "不會",
      "不要",
      "不想",
      "怕",
      "擔心",
      "不敢",
      "拒絕",
      "放棄",
      "不行",
      "不可能",
      "沒興趣",
      "不買",
      "免談",
      "再說吧",
    ],
  },
};

export function classifyKeywords(text: string): string[] {
  const found: string[] = [];
  for (const [bucket, terms] of Object.entries(KEYWORD_BUCKETS)) {
    if (terms.some((t) => text.includes(t))) {
      found.push(bucket);
    }
  }
  return found;
}

export function classifyDecision(text: string): DecisionKey {
  // 計算每個 bucket 的 keyword 命中數，取最多者
  const counts: Record<DecisionKey, number> = {
    願意: 0,
    觀望: 0,
    拒絕: 0,
  };
  (Object.keys(DECISION_BUCKETS) as DecisionKey[]).forEach((k) => {
    counts[k] = DECISION_BUCKETS[k].keywords.filter((kw) =>
      text.includes(kw)
    ).length;
  });
  // 找最大值；同分時 拒絕 > 觀望 > 願意（保守傾向）
  let best: DecisionKey = "觀望";
  let bestCount = counts.觀望;
  if (counts.拒絕 > bestCount) {
    best = "拒絕";
    bestCount = counts.拒絕;
  }
  if (counts.願意 > bestCount) {
    best = "願意";
  }
  // 若全都 0，預設觀望
  if (counts.願意 === 0 && counts.觀望 === 0 && counts.拒絕 === 0) {
    return "觀望";
  }
  return best;
}

export type Flow = {
  from: string; // keyword bucket
  to: DecisionKey;
  count: number;
  personas: Persona[];
};

export type Entry = { persona: Persona; answers: string[] };

/**
 * 把所有受訪者答案 → keyword × decision flows 矩陣。
 *
 * @param decisionFn 可選 — 自訂決策判定函式（例如用算盤產生的 intent 分數）
 *                  預設使用 classifyDecision (純關鍵字判斷)
 */
export function buildFlows(
  entries: Entry[],
  decisionFn?: (entry: Entry) => DecisionKey
): {
  flows: Flow[];
  keywordTotals: Record<string, number>;
  decisionTotals: Record<DecisionKey, number>;
} {
  const map = new Map<string, Map<DecisionKey, { count: number; personas: Persona[] }>>();
  const keywordTotals: Record<string, number> = {};
  const decisionTotals: Record<DecisionKey, number> = {
    願意: 0,
    觀望: 0,
    拒絕: 0,
  };

  for (const entry of entries) {
    const fullText = entry.answers.join("\n");
    const keywords = classifyKeywords(fullText);
    const decision = decisionFn
      ? decisionFn(entry)
      : classifyDecision(fullText);
    decisionTotals[decision]++;
    for (const kw of keywords) {
      keywordTotals[kw] = (keywordTotals[kw] || 0) + 1;
      if (!map.has(kw)) map.set(kw, new Map());
      const inner = map.get(kw)!;
      const existing = inner.get(decision) ?? { count: 0, personas: [] };
      existing.count++;
      existing.personas.push(entry.persona);
      inner.set(decision, existing);
    }
  }

  const flows: Flow[] = [];
  for (const [from, inner] of map) {
    for (const [to, { count, personas }] of inner) {
      flows.push({ from, to, count, personas });
    }
  }
  flows.sort((a, b) => b.count - a.count);

  return { flows, keywordTotals, decisionTotals };
}

/** 從 intent 分數判定決策（與 PhaseTransitionMap 的臨界線一致：60 / 40） */
export function decisionFromIntent(intent: number): DecisionKey {
  if (intent >= 60) return "願意";
  if (intent >= 40) return "觀望";
  return "拒絕";
}

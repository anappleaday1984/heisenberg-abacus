import type { Persona } from "./agents/personas-data";

// ---- 關鍵字桶 ----（受訪者文字裡命中其中之一就算屬於此桶）
//
// 設計原則：
//   1. 前 5 桶 = 受訪者「自身脈絡」(身份/環境)：機車、家庭、信用、投資、健康
//   2. 後 3 桶 = 對「產品本身」的反應：價格、信任、便利 — 金融商品 PM 最關心的訊號
//   3. 詞表盡量涵蓋同義詞 + 口語變體（破產 / 倒帳 / 欠錢 / 還不出 ...）讓自由作答 LLM 答案能命中
export const KEYWORD_BUCKETS: Record<string, string[]> = {
  "🛵 機車與工作": [
    // 車況 / 配備
    "機車", "電動機車", "二手車", "改裝", "車況", "重機",
    // 油 / 維修
    "油錢", "油價", "汽油", "加油", "充電",
    "爆胎", "維修", "保養", "顧路", "故障", "拋錨",
    // 跑單 / 平台
    "跑單", "跑外送", "送單", "派單", "接單", "送餐", "送件",
    "外送員", "外送", "平台", "平台抽成", "抽成", "抽傭", "獎勵金",
    "高峰時段", "尖峰時段", "用餐時段", "深夜時段",
    // 工時 / 路況
    "工時", "時薪", "業績", "排班", "全職", "兼職",
    "雨天", "下雨", "天氣", "路況", "塞車",
  ],
  "👨‍👩‍👧 家庭與責任": [
    // 撫養 / 經濟支柱
    "撫養", "扶養", "贍養", "養家", "家計", "支柱", "單親",
    // 子女
    "小孩", "孩子", "兒子", "女兒", "孫子", "孫女",
    "學費", "補習費", "註冊費", "教育費", "奶粉錢", "尿布",
    // 配偶
    "老婆", "太太", "妻子", "丈夫", "老公", "配偶", "另一半",
    // 父母
    "媽媽", "母親", "爸爸", "父親", "父母", "雙親", "公婆", "岳父", "岳母",
    // 雜項
    "家人", "親人", "家庭", "家裡", "孝親費", "贍養費", "生活費",
  ],
  "💸 信用與債務": [
    // 信用狀態
    "信用", "信用紀錄", "信用瑕疵", "信用空白", "聯徵", "信用評分",
    // 卡 / 貸
    "卡債", "卡費", "循環", "循環利息",
    "信貸", "貸款", "房貸", "車貸", "學貸", "代墊",
    // 違約 / 破產
    "破產", "倒帳", "還債", "欠錢", "欠款", "還不出", "繳不出",
    "套牢", "週轉不靈", "週轉",
    "遲繳", "拖欠", "違約", "被催繳", "強制扣款",
    // 條件
    "額度", "利率", "利息", "本金", "本息", "餘額", "信用卡帳單",
  ],
  "📈 投資與儲蓄": [
    // 投資工具
    "投資", "理財", "股市", "股票", "ETF", "基金", "債券",
    "加密", "加密貨幣", "比特幣", "幣圈", "NFT",
    // 儲蓄
    "存錢", "儲蓄", "存款", "定存", "活存", "零存整付",
    // 副業 / 創業
    "創業", "副業", "斜槓", "接案", "兼差",
    // 資產
    "資產", "房產", "不動產", "包租", "收租", "套房",
    // 退休 / 老本
    "退休金", "年金", "勞保", "勞退", "老本",
    // 應急
    "應急金", "預備金", "緊急金", "備用金",
    "複利", "報酬", "賺錢", "獲利",
  ],
  "🏥 健康與意外": [
    // 既有狀態
    "生病", "病史", "病痛", "舊疾", "三高", "糖尿病", "高血壓",
    "心血管", "慢性病", "腎臟", "肝", "癌",
    "失眠", "憂鬱", "焦慮",
    // 體力 / 過勞
    "健康", "體力", "疲憊", "過勞", "中暑", "脫水", "曬傷",
    // 意外
    "受傷", "外傷", "骨折", "扭傷", "拉傷", "燙傷",
    "車禍", "事故", "撞到", "被撞", "擦撞", "翻車", "追撞",
    // 醫療
    "住院", "開刀", "手術", "醫療", "急診", "復健",
    "意外", "失能", "傷殘", "意外險", "醫療險",
    "醫藥費", "醫療費", "看病", "掛號",
  ],
  "💰 價格與負擔": [
    // 主觀價格判斷
    "太貴", "貴", "便宜", "划算", "划不來", "不划算",
    "CP", "性價比", "C/P", "高貴", "高價", "低價",
    // 月繳 / 年費
    "月繳", "月費", "月付", "年費", "保費", "首期",
    // 撐得住嗎
    "撐不住", "撐不起", "撐不下去", "扛不住", "吃緊", "拮据",
    "省", "省錢", "節省", "節流", "預算",
    // 具體數字（199 199 元、6.88% 等）
    "199", "299", "499", "699", "999",
    "幾百", "幾千", "上萬", "破萬", "幾萬",
    "一個月", "一年", "每月", "每年", "終身",
    "免費", "0元", "零元", "0 元",
    // 能否負擔
    "負擔得起", "負擔不起", "買不起", "買得起",
  ],
  "🤝 信任與條款": [
    // 主觀信任
    "信任", "信得過", "信譽", "口碑", "可靠", "靠譜",
    // 詐騙 / 黑箱
    "怕被騙", "詐騙", "被騙", "騙人", "黑箱", "黑心",
    "隱藏", "藏招", "陷阱", "套路", "話術",
    // 條款 / 細則
    "條款", "細則", "細項", "小字", "魔鬼藏在",
    "保單", "合約", "綁約", "綁年約", "解約", "退保",
    // 業務 / 客服
    "業務", "業務員", "客服", "申訴", "客戶服務",
    // 拒賠 / 免責
    "拒賠", "拒保", "免責", "除外", "不理賠",
    "理賠", "理賠流程", "理賠速度", "出險",
    // 隱私 / 綁定
    "個資", "隱私", "綁定", "資料外洩",
  ],
  "⚡ 便利與速度": [
    // 速度
    "快", "速度", "立刻", "馬上", "即時", "瞬間", "現場",
    "慢", "拖", "拖延", "等很久", "等不及",
    // 線上 / APP
    "線上", "遠端", "雲端", "雲服務",
    "APP", "app", "應用程式", "手機", "智慧手機", "下載",
    // 流程 / 手續
    "流程", "手續", "麻煩", "繁瑣", "複雜", "卡關",
    "簡單", "輕鬆", "方便", "順手", "好操作",
    // 申辦
    "申請", "審核", "撥款", "撥下來", "核貸", "核保", "立刻撥",
    // 具體時間
    "30秒", "30 秒", "1分鐘", "一分鐘", "幾分鐘", "幾秒",
    // 通路
    "免出門", "免臨櫃", "臨櫃", "現場簽約", "對保",
  ],
  // 沒命中其他主題的受訪者落入此桶 — 確保每位受訪者都有歸屬，
  // 左右側（keyword / decision）總和守恆 = entries.length。
  "🔹 其他主題": [],
};

const FALLBACK_BUCKET = "🔹 其他主題";

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

/**
 * 找出文字裡命中關鍵字最多的「主要」桶 — 每位受訪者只屬於一個桶。
 * 平手時依 KEYWORD_BUCKETS 的宣告順序取第一個；完全沒命中走 fallback bucket。
 *
 * 為什麼要單一分類：桑基圖左右兩端必須使用同一個受訪者單位來縮放節點高度，
 * 否則命中多桶的人會被重複計數，左右比例對不起來。
 */
export function classifyPrimaryKeyword(text: string): string {
  let bestBucket = FALLBACK_BUCKET;
  let bestHits = 0;
  for (const [bucket, terms] of Object.entries(KEYWORD_BUCKETS)) {
    if (terms.length === 0) continue; // 跳過 fallback bucket 本身
    const hits = terms.filter((t) => text.includes(t)).length;
    if (hits > bestHits) {
      bestHits = hits;
      bestBucket = bucket;
    }
  }
  return bestBucket;
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
    const primary = classifyPrimaryKeyword(fullText);
    const decision = decisionFn
      ? decisionFn(entry)
      : classifyDecision(fullText);

    decisionTotals[decision]++;
    keywordTotals[primary] = (keywordTotals[primary] || 0) + 1;

    if (!map.has(primary)) map.set(primary, new Map());
    const inner = map.get(primary)!;
    const existing = inner.get(decision) ?? { count: 0, personas: [] };
    existing.count++;
    existing.personas.push(entry.persona);
    inner.set(decision, existing);
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

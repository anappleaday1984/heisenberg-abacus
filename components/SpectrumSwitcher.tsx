"use client";

import { useEffect, useMemo, useState } from "react";
import type { Persona } from "@/lib/agents/personas-data";
import { isCelebrity, resolvePortraitId } from "@/lib/celebrity-ids";
import {
  colorForPersona,
  detectProductType,
  isOpenContext,
  productLabel,
  type ProductType,
} from "@/lib/persona-scores";
import { useProductParams } from "@/lib/product-params-context";

type Props = {
  personas: Persona[];
  productContext?: string;
};

type AxisCfg = {
  icon: string;
  label: string; // 按鈕標籤
  blurb: string;
};

const AXES: Record<ProductType, AxisCfg> = {
  creditcard: {
    icon: "💳",
    label: "信用卡",
    blurb: "誰會用 APP 線上消費領回饋？",
  },
  loan: {
    icon: "💰",
    label: "信貸",
    blurb: "誰急需短期周轉現金？",
  },
  insurance: {
    icon: "🛡",
    label: "保險",
    blurb: "誰最在意意外造成的家計斷層？",
  },
};

// Persona × Product 的「顯影」短句模板。針對 demo 人設手刻一兩句重點台詞，
// 其他用泛用模板補滿。每行帶一個 vibe 關鍵字讓觀眾秒懂這位在想什麼。
const VOICE: Record<string, Partial<Record<ProductType, string>>> = {
  uncle_zealot: {
    loan: "利率 6% 我可以接受，過 10% 我家就斷糧了。",
    insurance: "意外險我必買 — 兩個小孩跟老母親都靠我。",
    creditcard: "回饋 5% 加油那張我會辦，但我不刷餐廳。",
  },
  slasher_girl: {
    loan: "信貸我用不到，我有正職薪水當底。",
    insurance: "跑單時段的補強保險我願意試一個月看看。",
    creditcard: "回饋給力的我會立刻換主卡。",
  },
  rehab_youth: {
    loan: "我信用破產 — 利率再低也批不過。",
    insurance: "出事我家沒人能救，這個我要。",
    creditcard: "我辦不了卡，連申請都過不去。",
  },
  retired_lohas: {
    loan: "這年紀借錢沒意義，我有定存。",
    insurance: "醫療險才是重點，意外險我可有可無。",
    creditcard: "回饋我還行，但我只刷加油跟超市。",
  },
  student: {
    loan: "200 萬以下勉強，但我父母會殺了我。",
    insurance: "199 一個月對我來說有點吃緊。",
    creditcard: "我只能辦學生卡，有限額但我會用。",
  },
  returning_mom: {
    loan: "我借了還不起 — 老公收入不穩。",
    insurance: "兩個小孩，這保險我得算進家庭預算。",
    creditcard: "媽媽卡那種我會辦，蝦皮 Momo 回饋實在。",
  },
  quiet_landlord: {
    loan: "我不需要信貸，我用房貸轉融資。",
    insurance: "199 太貴，同樣保額我商業險才 80。",
    creditcard: "我只挑頂級卡，回饋率不到 2% 不辦。",
  },
  ex_engineer: {
    loan: "我有套牢的海外投資，借不到太多。",
    insurance: "我心血管病史 — 一定被加費或拒保。",
    creditcard: "我有竹科那批白金卡，沒打算換。",
  },
  indie_singer: {
    loan: "演出費都是現金，我借不到信貸。",
    insurance: "下個月我可能就停了，不能綁年約。",
    creditcard: "我刷的多是樂器，這類回饋少得可憐。",
  },
  nomad: {
    loan: "我有應急金，借錢的成本不划算。",
    insurance: "我比較三家比 199 低的，看條款。",
    creditcard: "出國回饋好我就換主卡。",
  },
};

// 從問題語境抓一個代表性名詞放進 voice — 讓「對訂閱方案怎麼看」「對健身房怎麼看」
// 這類開放問題的顯影,會把「訂閱方案」「健身房」直接 inline 進句子,避免每位 persona
// 都只用泛稱「這類方案」造成內容雷同。
function extractContextNoun(context: string): string {
  if (!context) return "";
  const patterns = [
    /訂閱(?:制|式|服務|方案|app)?/,
    /會員(?:制|資格|方案|卡)?/,
    /健身(?:房|中心|教練|app|APP)?/,
    /補習(?:班)?|課程|線上課|實體課|工作坊/,
    /餐(?:點|盒|廳)|便當|早午餐|手搖|飲料|咖啡|拿鐵/,
    /平台|app|APP|應用程式|軟體/,
    /訂房|住宿|民宿|旅遊|機票/,
    /電動車|機車|自行車|交通工具/,
    /家電|3C|手機|相機|電腦/,
    /商品|產品|服務|方案/,
  ];
  for (const p of patterns) {
    const m = context.match(p);
    if (m) return m[0];
  }
  return "";
}

// Persona id 雜湊 — 在多個 template 中決定當前 persona 取哪一句,確保 deterministic。
function pidHash(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

// 「整體光譜」開放模式 — 沒明確金融商品時用。把產品名詞(從 context 抓出)+
// persona 特徵(年齡、收入、家庭、職業 hint)+ template 變體三者交叉,
// 30 位人物盡量句句不重複。
function generateOpenVoice(p: Persona, context: string): string {
  const text = `${p.archetype} ${p.personality} ${p.family} ${p.assetsAndEvents}`;
  const noun = extractContextNoun(context) || "這類方案";
  const wan = Math.round(p.yearlyIncomeTWD / 10_000);

  const isPoor = p.yearlyIncomeTWD < 400_000;
  const isMiddle = p.yearlyIncomeTWD >= 400_000 && p.yearlyIncomeTWD < 1_000_000;
  const isWealthy = p.yearlyIncomeTWD > 1_000_000;
  const hasDependents =
    /撫養|扶養|贍養|養.*孩|養.*家|負擔|支柱|單親|媽媽|爸爸|父親|母親/.test(text);
  const badCredit = /破產|卡債|信用瑕疵|遲繳|被拒|信用空白/.test(text);
  const tech = /工程師|新創|APP|軟體|科技|遊牧|電腦|剪輯|碼農/.test(text);
  const conservative = /保守|穩定|定存|謹慎|細心|認真|傳統|樂活|不搶快/.test(text);
  const risky = /創業|投資|股市|加密|斜槓|追求|夢想|改裝|叛逆/.test(text);
  const sick = /心血管|疾病|長期服藥|健康|憂鬱|病史/.test(text);
  const freelance = /斜槓|接案|外送|自由|遊牧|兼差|兼職/.test(text);
  const old = p.age >= 55;
  const young = p.age <= 25;

  // 每個分支準備 3 句模板,用 id hash mod 3 挑;盡量塞入 persona 自有的數字 / 名詞
  const v = pidHash(p.id) % 3;
  const pick = (a: string, b: string, c: string) => [a, b, c][v];

  if (badCredit) {
    return pick(
      `${noun} 我會先盯細則 — 過去踩過雷,直覺先設防。`,
      `信用紀錄有瑕疵的我,對 ${noun} 比一般人多繞兩圈。`,
      `${noun} 講得再好,我先問條件能不能寬到我這種人。`
    );
  }
  if (sick) {
    return pick(
      `身體不好,${noun} 我先想會不會卡到我用藥跟回診。`,
      `${noun} 對我來說彈性比折扣重要 — 萬一住院要能停。`,
      `有病史的人,${noun} 第一個問題就是核保不過怎麼辦。`
    );
  }
  if (old && isWealthy) {
    return pick(
      `${p.age} 歲手頭穩,${noun} 對我意義不大 — 我有自己的節奏。`,
      `定存夠用,${noun} 除非真的省事我才會考慮。`,
      `${noun} 講得花俏,沒解決退休後真實痛點都是白搭。`
    );
  }
  if (old) {
    return pick(
      `${p.age} 歲了,${noun} 我求穩,看別人用過再說。`,
      `這年紀面對 ${noun},我先想能不能讓孩子放心。`,
      `${noun} 流程一複雜我就放棄 — 沒耐心了。`
    );
  }
  if (hasDependents && isPoor) {
    return pick(
      `年收 ${wan} 萬還要顧家 — ${noun} 得擠進預算才考慮。`,
      `撐家計的人,${noun} 最在意能不能停、會不會綁死。`,
      `家裡開銷已經緊,${noun} 月費多 200 元都會評估。`
    );
  }
  if (hasDependents) {
    return pick(
      `身為家庭支柱 — ${noun} 的長期承擔比短期甜頭重要。`,
      `${noun} 出事誰善後 — 這是我會先問的。`,
      `${p.age} 歲還在養家,${noun} 我看的是穩不是 buzz。`
    );
  }
  if (isWealthy && risky) {
    return pick(
      `${noun} 我會試,但 IRR 跟最壞情況我自己會算。`,
      `現金流夠的人,${noun} 是放對位置的工具不是賭注。`,
      `${noun} 講機會我聽,講穩定我就關手機。`
    );
  }
  if (isWealthy) {
    return pick(
      `年收 ${wan} 萬,${noun} 我看 CP 值不到位的懶得開帳號。`,
      `有餘裕反而更挑 — ${noun} 浪費我時間最貴。`,
      `${noun} 要符合我現有生活方式才動,不會為它改習慣。`
    );
  }
  if (tech) {
    return pick(
      `${noun} 我先看 APP 體驗,UI 醜的直接跳過。`,
      `工程腦看 ${noun} — 介面跟流程設計比文案重要。`,
      `${noun} 多卡一步我就放棄,有 30 秒一鍵解決我就試。`
    );
  }
  if (freelance && young) {
    return pick(
      `跑單收入不穩,${noun} 一定要能停才敢試。`,
      `斜槓的我看 ${noun} — 千萬不能綁年約。`,
      `${noun} 彈性 > 折扣,我隨時可能換職涯方向。`
    );
  }
  if (young && isPoor) {
    return pick(
      `${p.age} 歲學生族 — ${noun} 預算很有限但夠便宜我會試。`,
      `${noun} 價格在我這個年齡層就決定一切。`,
      `${noun} 一定要先免費試,沒試我不付月費。`
    );
  }
  if (young) {
    return pick(
      `${p.age} 歲願意嘗試 ${noun},前提是流程一鍵搞定。`,
      `${noun} 社群口碑比廣告影響我多 — 我先去 Threads 搜。`,
      `${noun} 有 IG / TikTok 才會先觀察一下。`
    );
  }
  if (risky) {
    return pick(
      `${noun} 我願意賭,但要寫清楚最壞情況。`,
      `創業腦看 ${noun} 是機會還是分心,先衡量時間成本。`,
      `${noun} 講保守我會睡著,講高報酬我會醒。`
    );
  }
  if (conservative) {
    return pick(
      `${noun} 我先觀望半年,看穩定再進場。`,
      `保守的我,${noun} 要見過親友實際用過才動。`,
      `${noun} 文案越花俏我越懷疑 — 越樸實越可信。`
    );
  }
  if (isMiddle) {
    return pick(
      `年收 ${wan} 萬左右 — ${noun} 夾在「想試」跟「該省」之間。`,
      `中等收入族對 ${noun} 最敏感:多 500 元少 500 元都會算。`,
      `${noun} 要剛好打中我預算空隙我才會買。`
    );
  }
  // default
  return pick(
    `${p.age} 歲我有自己的步調 — ${noun} 講透明我才會動。`,
    `${noun} 對我來說 — 划算 + 不綁我才考慮。`,
    `${p.archetype} 看 ${noun}:不浪費我時間就好。`
  );
}

// 自訂人設沒有手刻台詞時，依 persona 屬性挑句 — 同一人在不同產品也會講不同話
function generateVoice(p: Persona, type: ProductType): string {
  const text = `${p.archetype} ${p.personality} ${p.family} ${p.assetsAndEvents}`;
  const income = p.yearlyIncomeTWD;
  const hasDependents =
    /撫養|扶養|贍養|養.*孩|養.*家|負擔|支柱|單親|媽媽|爸爸|父親|母親/.test(
      text
    );
  const isPoor = income < 400_000;
  const isWealthy = income > 1_000_000;
  const badCredit = /破產|卡債|信用瑕疵|遲繳|被拒|信用空白/.test(text);
  const tech = /工程師|新創|APP|軟體|科技|遊牧|電腦|剪輯/.test(text);
  const conservative = /保守|穩定|定存|謹慎|細心|認真|傳統|樂活|不搶快/.test(
    text
  );
  const risky = /創業|投資|股市|加密|斜槓|追求|夢想|改裝|叛逆/.test(text);
  const sick = /心血管|疾病|長期服藥|健康|憂鬱/.test(text);
  const old = p.age >= 55;
  const young = p.age <= 25;
  const middleAged = p.age >= 35 && p.age < 55;

  if (type === "loan") {
    if (badCredit) return "我信用紀錄不好 — 利率再低也批不過。";
    if (isWealthy) return "我有其他周轉管道，信貸不是首選。";
    if (hasDependents && isPoor) return "借了我還不起 — 家裡靠我撐著。";
    if (hasDependents) return `${p.age} 歲還在養家，借錢要算清楚還得起。`;
    if (old) return "我這年紀借錢沒太大意義，定存夠用。";
    if (young && isPoor) return "額度太小、利率太高都不要 — 我跑單還不起。";
    if (young) return "如果是創業或進修我會考慮，但條件要透明。";
    if (risky) return "資金缺口我會借，但 IRR 我自己會算。";
    if (conservative) return "我不愛背債 — 利率超過 5% 我就放棄。";
    return `年利率 6% 是我心理上限，超過我就不申請。`;
  }

  if (type === "insurance") {
    if (sick) return "我有病史 — 怕被加費或拒保，條款要先看清楚。";
    if (hasDependents && isPoor)
      return "家裡有人靠我，這保險我得算進預算 — 但 199 我會猶豫。";
    if (hasDependents) return "出事的話小孩跟家計怎麼辦，這個我會買。";
    if (isWealthy) return "我已有商業險，CP 值我會比過再說。";
    if (old) return "醫療理賠才是重點，意外險可有可無。";
    if (young && isPoor) return "199 一個月對我預算來說有點吃緊。";
    if (young) return "月繳能停我才買，不要綁年約。";
    if (risky) return "下個月我可能就轉行了，要能彈性退保。";
    if (conservative) return "我看條款 — 既往症不賠的我就不買。";
    return `我先試一個月，理賠速度我朋友踩過雷。`;
  }

  // creditcard
  if (badCredit) return "我辦不了卡 — 連申請都過不去。";
  if (isWealthy) return "頂級卡才考慮，回饋不到 2% 我懶得開。";
  if (tech) return "回饋好 + APP 體驗順我就換主卡。";
  if (old) return "我刷的少，回饋對我吸引力一般。";
  if (young && isPoor) return "我只能辦學生卡 — 有限額但累積信用用。";
  if (young) return "回饋率夠高我立刻換，但我不刷大餐。";
  if (hasDependents) return "媽媽 / 爸爸卡那種我會辦，民生消費回饋最實在。";
  if (conservative) return "我只刷加油跟超市，回饋我精算過。";
  if (middleAged) return "外送平台 3% 對我有感，但綁帳號要看條款。";
  return `${p.age} 歲了，年費 0 + 加油回饋我才考慮辦。`;
}

// ---------- 頭像 emoji 對應 ----------
//
// 從 archetype + name + personality + family + assetsAndEvents 抓關鍵字推斷
// 最能代表這位 persona 形象的 emoji。順序很重要：先 specific 角色（樂手、
// YouTuber、工程師），再退到大類（媽媽、學生、退休），最後依年齡 + 性別
// fallback。同一位 persona 跑多次都會得到相同 emoji（純 deterministic）。
function getEmojiForPersona(p: Persona): string {
  const text = `${p.archetype} ${p.name} ${p.personality} ${p.family} ${p.assetsAndEvents}`;
  const isF = p.gender === "女";

  // 高辨識度的職業 / 形象（先 specific → 再 general）
  if (/搖滾|樂團|樂手|歌手|主唱|教父/.test(text)) return isF ? "🎤" : "🎸";
  if (/啦啦隊|舞者|主播|女神|偶像|代言/.test(text)) return "💃";
  if (/YouTube|YouTuber|創作者|拍片|頻道|實況/i.test(text)) return "🎬";
  if (/工程師|新創|軟體|科技|碼農|演算法|程式|App.*開發/.test(text))
    return isF ? "👩‍💻" : "🧑‍💻";
  if (/學生|大學|研究所|高中生/.test(text)) return isF ? "👩‍🎓" : "🧑‍🎓";
  if (/海歸|留學|跨國|海外/.test(text)) return "✈️";
  if (/包租|房東|地主|多套房產/.test(text)) return "🏘️";
  if (/富二代|世家|家裡有工廠|繼承/.test(text)) return "🤫";
  if (/黑手|修車|機械|汽修|機車師傅/.test(text)) return "🔧";
  if (/清潔|打掃|阿桑|家管|傳統女性/.test(text)) return "🧹";
  if (/工廠|產線|作業員/.test(text)) return isF ? "👷‍♀️" : "👷";
  if (/奶爸|帶小孩|顧小孩|準時收工煮飯/.test(text)) return "👨‍🍼";
  if (/單親|二度就業|媽媽|母親/.test(text) && isF) return "👩";
  if (/支柱.*父|爸爸|父親/.test(text) && !isF) return "👨";
  if (/更生|出獄|前科|刑滿/.test(text)) return "🪨";
  if (/暴躁|怒哥|火爆|滿口粗字|脾氣/.test(text)) return "😤";
  if (/夢想|追夢|藝人|演員/.test(text)) return "✨";
  if (/包租|投資|股市|理財/.test(text)) return "💼";
  if (/退休|樂活|阿伯|阿嬤/.test(text)) return isF ? "👵" : "👴";
  if (/數位遊牧|遊牧|自由工作|平衡/.test(text)) return "🌴";

  // 中年大叔 / 大哥（沒對到上述職業）
  if (/教父|大叔|大哥|衝刺|耐勞/.test(text) && !isF) return "🧔";
  if (/小資|斜槓|兼職/.test(text) && isF) return "👩‍💼";

  // 年齡 + 性別 fallback
  if (p.age <= 22) return isF ? "👧" : "👦";
  if (p.age >= 60) return isF ? "👵" : "👴";
  if (p.age >= 45) return isF ? "👩‍🦳" : "🧔";
  return isF ? "👩" : "👨";
}

export function SpectrumSwitcher({ personas, productContext }: Props) {
  const { type, setType } = useProductParams();

  const isOpen = useMemo(
    () => isOpenContext(productContext ?? ""),
    [productContext]
  );
  const detected = useMemo(
    () => detectProductType(productContext ?? ""),
    [productContext]
  );

  // 第一次掛載 + productContext 變動時自動切到偵測到的類型
  useEffect(() => {
    setType(detected);
  }, [detected, setType]);

  // 開放式問題：不貼產品標籤，改用「整體口吻」介紹
  const cfg: AxisCfg = isOpen
    ? {
        icon: "🏛",
        label: "整體光譜",
        blurb: "誰承壓最大？誰最有餘裕？",
      }
    : AXES[type];
  const headerLabel = isOpen ? "整體光譜" : `${cfg.icon} ${cfg.label}`;
  const headerIcon = "🏛";
  // 開放模式用「基本介紹」(中性、適合任何商品),產品模式維持「『XX』口吻」
  const introSuffix = isOpen
    ? "基本介紹"
    : `「${productLabel(type)}」口吻`;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // 預設展示 8 位（橫向卡片），按「查看全部」可展開全部 30 位。
  // 6-8 位足以展現受訪者多樣性，30 位橫向滾動會稀釋焦點。
  const DEFAULT_FEATURED_COUNT = 8;
  const [expandAll, setExpandAll] = useState(false);
  const visiblePersonas = useMemo(
    () => (expandAll ? personas : personas.slice(0, DEFAULT_FEATURED_COUNT)),
    [personas, expandAll]
  );

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-5 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-violet-400 font-bold">
            {headerIcon} 受訪者顯影 · {headerLabel}
          </div>
          <h3 className="text-base font-bold text-slate-100 leading-tight mt-0.5">
            {personas.length} 位受訪者的{introSuffix}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{cfg.blurb}</p>
        </div>
        {personas.length > DEFAULT_FEATURED_COUNT && (
          <button
            type="button"
            onClick={() => setExpandAll((v) => !v)}
            className="text-[10px] px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700 text-slate-300 hover:text-slate-100 hover:border-violet-500/60 transition-colors whitespace-nowrap"
          >
            {expandAll
              ? `收起（顯示 ${DEFAULT_FEATURED_COUNT} 位）`
              : `查看全部 ${personas.length} 位 →`}
          </button>
        )}
      </div>

      {/* 橫向滾動卡片容器 — overflow-x-auto + min-w-max 讓 flex 子元素不被壓縮 */}
      <div className="overflow-x-auto pb-8 pt-3 -mx-2 px-2">
        <div className="flex gap-3 min-w-max">
          {visiblePersonas.map((p) => {
            const idxInAll = personas.indexOf(p);
            const color = colorForPersona(p.id, idxInAll);
            // 開放模式(沒明確金融商品)用 generateOpenVoice + 從 productContext
            // 抓出來的名詞 inline 到句子裡,讓 30 位人物的「基本介紹」針對商品語境
            // 而不只是泛談;明確產品(信貸/保險/信用卡)才用 VOICE 手刻或 generateVoice。
            const line = isOpen
              ? generateOpenVoice(p, productContext ?? "")
              : (VOICE[p.id]?.[type] ?? generateVoice(p, type));
            const isHovered = hoverIdx === idxInAll;
            return (
              <PersonaCard
                key={`${p.id}-${isOpen ? "open" : type}`}
                persona={p}
                quote={line}
                color={color}
                isHovered={isHovered}
                onHover={() => setHoverIdx(idxInAll)}
                onLeave={() => setHoverIdx(null)}
              />
            );
          })}
        </div>
      </div>

      <style jsx>{`
        @keyframes spectrum-fade {
          from {
            opacity: 0;
            transform: translateY(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

// ---------- PersonaCard ----------
//
// 漫畫風人設卡 — 直立卡片：emoji 大頭像（依 archetype/personality 推斷）+ 原型 +
// 名字 + 一句口吻。emoji 用顏色漸層底搭出「人設氛圍」，比隨機生成的頭像更貼近
// 該 persona 的形象。
//
// hover 時整張卡上彈 -12px，色帶亮起。共用上層 hoverIdx 確保「滑到下一位、上
// 一位歸位」的 CSS 自然行為。
//
// PORTRAIT_STYLE 控制頭像來源資料夾：
//   "flat"     → /personas/            扁平企業插畫
//   "cyber"    → /personas-cyber/      賽博龐克霓虹
//   "silver"   → /personas-silver/     白銀極簡科技
//   "techlife" → /personas-techlife/   科技生活感
// 切換只需改這一行；找不到圖時自動 fallback 到 emoji 漸層底。
type PortraitStyle = "flat" | "cyber" | "silver" | "techlife";
const PORTRAIT_STYLE: PortraitStyle = "techlife";
const PORTRAIT_DIRS: Record<PortraitStyle, string> = {
  flat: "/personas",
  cyber: "/personas-cyber",
  silver: "/personas-silver",
  techlife: "/personas-techlife",
};

type CardProps = {
  persona: Persona;
  quote: string;
  color: string;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
};

function PersonaCard({
  persona,
  quote,
  color,
  isHovered,
  onHover,
  onLeave,
}: CardProps) {
  const emoji = getEmojiForPersona(persona);
  // 圖檔預期路徑：public${PORTRAIT_DIRS[PORTRAIT_STYLE]}/{id}.png
  // 圖檔不存在時用 onError 切回 emoji 漸層底，確保 demo 不會出現破圖。
  const [imgFailed, setImgFailed] = useState(false);
  // 走 resolvePortraitId() 讓 v2 上班族 persona 共用 v1 同 archetype 的 portrait
  // (v2 是 v1 的職業變體,沒必要再產一套圖)
  const imageSrc = `${PORTRAIT_DIRS[PORTRAIT_STYLE]}/${resolvePortraitId(persona.id)}.png`;
  // 名人 portrait 用 blur filter 處理 — 6 位真人不應該清楚顯示長相,只保留輪廓 / 色調。
  const celeb = isCelebrity(persona.id);

  // 收入字串：取百萬 → "150 萬"，沒到 → "75 萬"，避免太多 0 干擾閱讀
  const incomeWan = (persona.yearlyIncomeTWD / 10_000).toFixed(0);

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={`
        relative w-36 shrink-0 cursor-pointer rounded-xl overflow-hidden
        bg-slate-800/80 border transition-all duration-300 ease-out
        ${
          isHovered
            ? "-translate-y-3 border-violet-500/70 shadow-2xl shadow-violet-500/20"
            : "border-slate-700/80 hover:border-slate-600"
        }
      `}
      style={{
        animation: "spectrum-fade 360ms ease",
      }}
    >
      {/* 頭像區（正方形）— 優先用 AI 生成的 PNG，失敗 fallback 到 emoji 漸層底 */}
      <div className="relative aspect-square overflow-hidden bg-slate-900">
        {!imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={`${persona.archetype}：${persona.name}`}
            loading="lazy"
            className="w-full h-full object-cover"
            style={
              celeb
                ? { filter: "blur(8px) saturate(0.85)", transform: "scale(1.08)" }
                : undefined
            }
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${color}cc 0%, ${color}55 60%, #0f172a 100%)`,
            }}
          >
            <span
              className="select-none drop-shadow-md"
              style={{ fontSize: "72px", lineHeight: 1 }}
              aria-label={persona.archetype}
            >
              {emoji}
            </span>
          </div>
        )}

        {/* 性別 / 年齡 徽章 — 永遠在左上 */}
        <span className="absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded-md font-bold bg-slate-950/70 text-slate-100 backdrop-blur-sm z-10">
          {persona.gender}/{persona.age}
        </span>

        {/* 收入結構 overlay — hover 時淡入蓋在頭像上（B2）*/}
        <div
          className={`absolute inset-0 flex flex-col justify-center px-3 py-2 bg-slate-950/85 backdrop-blur-sm transition-opacity duration-300 ${
            isHovered ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">
            💰 年收入
          </div>
          <div className="text-base font-bold text-amber-300 leading-tight">
            NT$ {incomeWan} 萬
          </div>
          <div className="text-[10px] text-slate-300 mt-1.5 leading-snug">
            {persona.incomeBreakdown}
          </div>
        </div>
      </div>

      {/* 文字區 */}
      <div className="px-2.5 pt-2 pb-2.5">
        <div className="text-[10px] text-violet-300/80 font-medium truncate">
          {persona.archetype}
        </div>
        <div className="text-[13px] font-bold text-slate-100 leading-tight mb-1.5 truncate">
          {persona.name}
        </div>
        <div className="text-[11px] text-slate-300 italic leading-snug line-clamp-3 min-h-[2.8em]">
          「{quote}」
        </div>
      </div>

      {/* hover 時底部加上一條色帶 */}
      <div
        className={`absolute bottom-0 left-0 right-0 h-1 transition-opacity duration-300 ${
          isHovered ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: color }}
      />
    </div>
  );
}

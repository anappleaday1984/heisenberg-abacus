/**
 * 用 Pollinations.ai (free, 不需 API key) 為每位 persona 生成頭像。
 *
 * 用法：
 *   node scripts/generate-portraits.mjs                          # flat 企業插畫風（預設）
 *   node scripts/generate-portraits.mjs --style=cyber            # 賽博龐克霓虹風
 *   node scripts/generate-portraits.mjs --style=silver           # 白銀極簡科技風
 *   node scripts/generate-portraits.mjs --style=techlife         # 深色科技背景 + 朝氣生活感
 *   node scripts/generate-portraits.mjs --style=scavenger        # 工業廢土 / 大地色系
 *   node scripts/generate-portraits.mjs --force                  # 重畫已存在的
 *   node scripts/generate-portraits.mjs --only=uncle_zealot      # 只跑指定 ID
 *
 * 風格 / 輸出對照：
 *   --style=flat       → public/personas/             扁平企業插畫（Storyset 氣質）
 *   --style=cyber      → public/personas-cyber/       賽博龐克霓虹（cyan + electric pink）
 *   --style=silver     → public/personas-silver/      白銀極簡科技（white-silver minimalism）
 *   --style=techlife   → public/personas-techlife/    深色科技底 + 生活化朝氣表情
 *   --style=scavenger  → public/personas-scavenger/   工業廢土 / 磨損裝備 / 大地金屬色
 *
 * Pollinations.ai 是免費代理多個 image gen model（Flux 等）的服務，不需 API key、
 * 直接 GET 帶 prompt 就回 image bytes。生成時間每張約 30-90s，並行 1（免費版限制）。
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";
const MODEL = "flux"; // pollinations 的 Flux 模型 — 漫畫/插畫風表現最好
const PERSONAS_PATH = path.resolve("data/personas.json");
// Pollinations 免費版每 IP 只允許 1 個 request 排隊，concurrency > 1 會 429。
const CONCURRENCY = 1;
const REQ_TIMEOUT_MS = 120_000; // cyber 風 prompt 比較長、render 比較久
const MAX_RETRIES = 5;

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args
  .find((a) => a.startsWith("--only="))
  ?.slice("--only=".length)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const STYLE = (args.find((a) => a.startsWith("--style="))?.slice("--style=".length) ?? "flat").toLowerCase();
const STYLE_DIRS = {
  flat: "public/personas",
  cyber: "public/personas-cyber",
  silver: "public/personas-silver",
  techlife: "public/personas-techlife",
  scavenger: "public/personas-scavenger",
};
if (!STYLE_DIRS[STYLE]) {
  console.error(`✗ 未知 --style=${STYLE}，可用：${Object.keys(STYLE_DIRS).join(" / ")}`);
  process.exit(1);
}

const OUTPUT_DIR = path.resolve(STYLE_DIRS[STYLE]);

await fs.mkdir(OUTPUT_DIR, { recursive: true });

let personas;
try {
  personas = JSON.parse(await fs.readFile(PERSONAS_PATH, "utf-8"));
} catch (err) {
  console.error(`✗ 讀不到 ${PERSONAS_PATH}：`, err.message);
  process.exit(1);
}

if (only) {
  personas = personas.filter((p) => only.includes(p.id));
  if (personas.length === 0) {
    console.error(`✗ --only 指定的 ID 在 personas.json 找不到：${only.join(", ")}`);
    process.exit(1);
  }
}

console.log(
  `\n開始生成頭像：${personas.length} 位 · style=${STYLE} · 並行 ${CONCURRENCY} · ${force ? "強制重畫" : "已有檔案的會跳過"}\n` +
    `輸出：${path.relative(process.cwd(), OUTPUT_DIR)}/\n`
);

// 名人 persona → 真實人名映射(Flux 認得這些名字會畫出相似面貌)。
// 描述只列「臉部特徵」,不提職業/身分(NVIDIA founder / rock musician / actor 等),
// 因為職業關鍵字會把 Flux 拉向「公關照 / stage 低調戲劇光」,讓畫面變暗、跟其他受訪者
// 風格不一致。臉部特徵足以讓 model 畫出相似面貌,又不會 bleed 進公關照打光。
const CELEBRITY_LIKENESS = {
  nv_jensen_true:
    "Jensen Huang — older Taiwanese-American man, short dark hair, glasses, friendly knowing grin",
  chin_blue_500:
    "Wu Bai 伍佰 — middle-aged Taiwanese man, dark sunglasses, long-ish hair, weathered confident features",
  mizuki_official:
    "Lin Hsiang 林襄 — young Taiwanese woman, sweet warm smile, bright eyes, soft long hair",
  greg_han_01:
    "Hsu Kuang-han 許光漢 — young Taiwanese man, gentle handsome features, slight knowing smile",
  persona_motn8zh9:
    "法拉利姊 — older Taiwanese woman, theatrical expressive features, distinct dramatic eyebrows",
  persona_motn96at:
    "胡漢龑 吊車大王 — older Taiwanese man, broad weathered face, confident grin, salt-and-pepper hair",
};

// 把 persona 屬性壓成英文人物描述短句（給 prompt 用）
//
// 年齡描述精確化：原本只分 young / middle-aged / senior 三檔，Flux 不夠尊重數字，
// 25 歲女性被畫成 50 歲的情況常見。改成依十年級距更細，並把「look exactly N years old」
// 重複兩次強化 model attention。
//
// 若 persona 屬於名人池，會在描述前段加上「resembling [celeb]」 hint，讓 Flux 畫出
// 相似面貌（不是直接複製照片，而是學習過的相似度）。
function characterDesc(p) {
  let ageBucket;
  if (p.age <= 22) ageBucket = "early-20s";
  else if (p.age <= 29) ageBucket = "late-20s";
  else if (p.age <= 35) ageBucket = "early-30s";
  else if (p.age <= 42) ageBucket = "late-30s to early-40s";
  else if (p.age <= 50) ageBucket = "mid-40s to late-40s";
  else if (p.age <= 60) ageBucket = "50s";
  else if (p.age <= 70) ageBucket = "60s";
  else ageBucket = "70s or older";

  const gender = p.gender === "女" ? "woman" : "man";
  const personalityShort = (p.personality || "")
    .split(/[、，,]/)
    .slice(0, 2)
    .join(", ");
  const celebHint = CELEBRITY_LIKENESS[p.id]
    ? `resembling ${CELEBRITY_LIKENESS[p.id]}, `
    : "";
  // 在描述中強調兩次年齡（bucket + 確切年齡），讓 Flux 比較難忽略
  return `${celebHint}${ageBucket} Asian ${gender}, looking exactly ${p.age} years old (skin and features matching age ${p.age}), ${p.archetype} (${personalityShort})`;
}

// Pollinations / Flux 用英文 prompt 表現比較穩；persona 關鍵字保留中文當 hint。
// archetype + age + gender 是主要特徵；style 詞放後段，model 比較尊重後段風格指示。
const PROMPT_BUILDERS = {
  flat: (p) => {
    const ageGroup =
      p.age <= 25 ? "young" : p.age >= 55 ? "senior" : "middle-aged";
    const gender = p.gender === "女" ? "woman" : "man";
    const personalityShort = (p.personality || "")
      .split(/[、，,]/)
      .slice(0, 2)
      .join(", ");
    return [
      `Flat illustration portrait of a ${ageGroup} Asian ${gender}, around ${p.age} years old`,
      `Persona archetype: ${p.archetype} (${personalityShort})`,
      `Style: corporate flat illustration, Storyset and unDraw aesthetic, modern tech illustration vibe`,
      `Rounded geometric shapes, soft pastel color palette with one bright accent color (purple, cyan, or coral)`,
      `3/4 face angle, head and shoulders portrait crop, friendly approachable expression`,
      `Clean confident lines, modern professional, vector-style finish`,
      `Plain pastel solid background, single subject, centered composition`,
      `No text, no logo, no watermark, no borders, no photorealism, no extra people`,
    ].join(". ");
  },
  cyber: (p) => {
    // 賽博龐克霓虹風 — 使用者提供的 template，把 [Character Description] 換成 persona
    const desc = characterDesc(p);
    return [
      `A hyper-realistic cyberpunk portrait of an ${desc}, depicted in a futuristic high-tech setting`,
      `The character features subtle cybernetic implants and is illuminated by cinematic neon rim lighting in cyan and electric pink`,
      `Soft bokeh background of a sprawling megacity with holographic interfaces and digital rain`,
      `Intricate tech-wear textures, sharp focus, volumetric lighting, rendered in Unreal Engine 5, 8k resolution, highly detailed skin and mechanical parts`,
      `Head and shoulders portrait crop, single subject, centered composition`,
      `No text, no logo, no watermark, no borders, no extra people`,
    ].join(". ");
  },
  silver: (p) => {
    // 白銀極簡科技風 — 高階純淨、生醫科技 / 高端商務 / AI 融合氣質
    const desc = characterDesc(p);
    return [
      `A high-end, clean futuristic portrait of an ${desc}`,
      `The aesthetic is white-silver and minimalist`,
      `The character is wearing garments made of intelligent, form-fitting fabric with delicate bioluminescent integrated circuits glowing in soft cool-white light`,
      `The setting is a minimalist, brightly lit white studio with curved, geometric glass and polished metallic surfaces in the background`,
      `Soft, diffused lighting without harsh shadows, subtle air-gel or light-refracting elements`,
      `Hyper-realistic, 8k resolution, elegant composition`,
      `Head and shoulders portrait crop, single subject, centered composition`,
      `No text, no logo, no watermark, no borders, no extra people`,
    ].join(". ");
  },
  techlife: (p) => {
    // 深色科技背景 + 生活化朝氣 — 不要 cyberpunk 那麼侵略性，比較像「懂科技的現代人」
    const desc = characterDesc(p);
    const isCeleb = !!CELEBRITY_LIKENESS[p.id];
    // 名人額外調光 — 名人 hint 容易把 Flux 拉向「公關照 / 低調戲劇光」,
    // 顯影出來顏色比一般受訪者暗。這段強制把光調回「同系列、冷色明亮 ambient」,
    // 讓六位名人視覺上跟其他受訪者放在一起時是同一組畫面。
    const celebTone = isCeleb
      ? `Critical: this portrait belongs to the same editorial techlife series as other contemporary lifestyle portraits — match their cool ambient look exactly. Do NOT use publicity-photo / paparazzi / red-carpet / stage / studio low-key lighting. Use even, bright soft ambient light with cool cyan-teal hue, well-lit face (no dramatic shadows), consistent in mood with the rest of the series`
      : null;
    return [
      `Cinematic editorial portrait of an ${desc}`,
      `Dark tech-themed background with subtle holographic UI panels and soft circuit-line accents (cyan / violet glow), bokeh blur`,
      `Character has a vibrant, cheerful, energetic expression that reflects their personality — feels alive and approachable, not corporate`,
      `Modern casual lifestyle wear (relaxed jacket, t-shirt, denim, etc.), natural relaxed posture`,
      `Soft rim lighting in cyan or violet against dark slate-blue background, gentle key light on face`,
      `Hyper-realistic, sharp focus on character with soft tech bokeh, head and shoulders portrait crop`,
      `8k resolution, single subject, centered composition`,
      celebTone,
      `No text, no logo, no watermark, no borders, no extra people`,
    ]
      .filter(Boolean)
      .join(". ");
  },
  scavenger: (p) => {
    // 工業廢土 / 末日生存 — 強調實用主義、磨損感、堅韌；土系 + 金屬灰
    const desc = characterDesc(p);
    return [
      `Industrial Scavenger style portrait of an ${desc}`,
      `Wearing rugged, weathered modular gear — utility vest, worn straps, practical pouches, occasional carbon fiber panel`,
      `Rusty corrugated metal background with patina, warm dusty atmospheric lighting from low side angle`,
      `Textures of carbon fiber, worn leather, oxidized metal, scuffed fabric — earthy palette of rust orange, sand, charcoal, gunmetal`,
      `Resilient, determined expression carrying weight of survival; hint of vital toughness rather than despair`,
      `Hyper-realistic, sharp detail on gear textures, head and shoulders portrait crop`,
      `8k resolution, cinematic composition, single subject`,
      `No text, no logo, no watermark, no borders, no extra people`,
    ].join(". ");
  },
};

const buildPrompt = PROMPT_BUILDERS[STYLE];

// Deterministic seed — 用 persona.id 的 hash 換成數字，保證同一位 persona 重跑也是同一張圖
function seedFor(id) {
  const h = crypto.createHash("sha256").update(id).digest();
  return h.readUInt32BE(0) % 1_000_000;
}

async function generateOne(p) {
  const dest = path.join(OUTPUT_DIR, `${p.id}.png`);

  if (!force) {
    try {
      await fs.access(dest);
      console.log(`  · ${p.id} (${p.archetype}：${p.name}) 已存在、略過`);
      return { id: p.id, status: "skip" };
    } catch {
      // not exist — go ahead
    }
  }

  // 把 prompt url-encode，做進 GET path
  const promptEncoded = encodeURIComponent(buildPrompt(p));
  const params = new URLSearchParams({
    width: "768",
    height: "768",
    seed: String(seedFor(p.id)),
    model: MODEL,
    nologo: "true",
    private: "true",
    enhance: "true", // pollinations 內建會擴寫 prompt（提升品質）
  });
  const url = `${POLLINATIONS_BASE}/${promptEncoded}?${params.toString()}`;

  const t0 = Date.now();
  // 對 429 / 5xx / 逾時做 exp-backoff retry — pollinations 偶爾會把 queue 塞爆
  let lastErr = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const wait = Math.min(5_000 * Math.pow(2, attempt - 1), 60_000);
      const jitter = Math.random() * 0.3 + 0.85;
      const waitMs = Math.floor(wait * jitter);
      console.log(`    ↻ ${p.id} retry #${attempt} 等 ${(waitMs / 1000).toFixed(1)}s`);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);

    let resp;
    try {
      resp = await fetch(url, { signal: ctrl.signal });
    } catch (err) {
      clearTimeout(timer);
      lastErr = err.name === "AbortError" ? `timeout ${REQ_TIMEOUT_MS}ms` : err.message;
      continue; // retry
    }
    clearTimeout(timer);

    if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
      lastErr = `HTTP ${resp.status}`;
      continue; // retry
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.log(`  ✗ ${p.id}：HTTP ${resp.status} ${resp.statusText} ${text.slice(0, 120)}`);
      return { id: p.id, status: "fail", err: `HTTP ${resp.status}` };
    }

    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) {
      const text = await resp.text().catch(() => "");
      console.log(`  ✗ ${p.id}：回應不是圖片（content-type=${ct}）：${text.slice(0, 200)}`);
      return { id: p.id, status: "fail", err: `non-image response` };
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length < 1024) {
      lastErr = `image too small (${buffer.length} bytes)`;
      continue; // retry — pollinations 偶爾回 1KB 錯誤頁
    }

    await fs.writeFile(dest, buffer);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    const kb = (buffer.length / 1024).toFixed(0);
    const retryNote = attempt > 0 ? ` [retry x${attempt}]` : "";
    console.log(`  ✓ ${p.id} (${p.archetype}：${p.name}) → ${path.relative(process.cwd(), dest)} (${kb}KB, ${sec}s)${retryNote}`);
    return { id: p.id, status: "ok" };
  }

  console.log(`  ✗ ${p.id}：用完 ${MAX_RETRIES} 次 retry 仍失敗 (${lastErr})`);
  return { id: p.id, status: "fail", err: lastErr };
}

// Worker pool — 並行 CONCURRENCY 個 task，呼叫 image-01
const queue = [...personas];
const results = [];
const workers = Array.from({ length: Math.min(CONCURRENCY, personas.length) }, async () => {
  while (queue.length > 0) {
    const p = queue.shift();
    if (!p) return;
    results.push(await generateOne(p));
  }
});
await Promise.all(workers);

const ok = results.filter((r) => r.status === "ok").length;
const skip = results.filter((r) => r.status === "skip").length;
const fail = results.filter((r) => r.status === "fail").length;
console.log(`\n完成：${ok} 張新生成、${skip} 略過、${fail} 失敗。輸出在 ${path.relative(process.cwd(), OUTPUT_DIR)}/`);

if (fail > 0) {
  const failedIds = results.filter((r) => r.status === "fail").map((r) => r.id);
  console.log(`\n失敗的 persona id：${failedIds.join(", ")}`);
  console.log(`想重試只跑這幾位：node --env-file=.env.local scripts/generate-portraits.mjs --only=${failedIds.join(",")}`);
}

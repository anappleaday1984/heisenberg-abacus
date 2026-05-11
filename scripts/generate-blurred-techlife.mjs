/**
 * 以 student.png 為構圖模板，生成「人物完全模糊」的 techlife 剪影。
 *
 * 用法：node scripts/generate-blurred-techlife.mjs
 * 輸出：public/personas-techlife/z_blurred_techlife.png
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";
const MODEL = "flux";
const OUT = path.resolve("public/personas-techlife/z_blurred_techlife.png");
const REQ_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 5;

// 沿用 student.png 構圖，但用「景深倒置 + 數位粒子溶解」逼 Flux 不要畫臉
const PROMPT = [
  `Editorial half-body composition, dark tech-themed environment, head-and-shoulders framing`,
  `Inverted depth-of-field — the human subject in the foreground is extremely out of focus, severely defocused, bokeh'd into an unrecognizable blob of soft glowing color, while the background tech environment behind them is sharp and detailed`,
  `The figure is also dissolving into glowing cyan and violet digital data particles and pixel smoke — the head and shoulders shape is suggested only as a hazy ghostly cloud of light particles, no skin, no facial features whatsoever, no eyes, no nose, no mouth, no hair, no jawline, no fabric details, no clothing pattern`,
  `Background in sharp focus: dark slate-blue and deep navy tech scene with crisp holographic UI panels, glowing circuit-line traces in cyan and electric violet, layered bokeh of blue and purple lights, data interface elements, subtle motion of code raining down`,
  `Soft cyan and violet glow forming the figure's vague outline as it dissipates into particles`,
  `Centered composition, anonymous unidentifiable subject, 8k resolution on background`,
  `No text, no logo, no watermark, no borders, no extra people, absolutely zero recognizable face, no readable identity, no profile silhouette of nose or chin, no clothing`,
].join(". ");

function seedFor(label) {
  const h = crypto.createHash("sha256").update(label).digest();
  return h.readUInt32BE(0) % 1_000_000;
}

await fs.mkdir(path.dirname(OUT), { recursive: true });

const params = new URLSearchParams({
  width: "768",
  height: "768",
  seed: String(seedFor("z_blurred_techlife_v3_dissolve")),
  model: MODEL,
  nologo: "true",
  private: "true",
  enhance: "true",
});
const url = `${POLLINATIONS_BASE}/${encodeURIComponent(PROMPT)}?${params}`;

console.log(`\n生成模糊 techlife 人物 → ${path.relative(process.cwd(), OUT)}\n`);

const t0 = Date.now();
let lastErr = "";
for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
  if (attempt > 0) {
    const wait = Math.min(5_000 * Math.pow(2, attempt - 1), 60_000);
    const jitter = Math.random() * 0.3 + 0.85;
    await new Promise((r) => setTimeout(r, Math.floor(wait * jitter)));
    console.log(`  ↻ retry #${attempt}`);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
      lastErr = `HTTP ${resp.status}`;
      continue;
    }
    if (!resp.ok) {
      console.log(`  ✗ HTTP ${resp.status}`);
      process.exit(1);
    }
    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) {
      lastErr = `non-image ct=${ct}`;
      continue;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 1024) {
      lastErr = `too small (${buf.length}B)`;
      continue;
    }
    await fs.writeFile(OUT, buf);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    const kb = (buf.length / 1024).toFixed(0);
    console.log(`  ✓ z_blurred_techlife → ${kb}KB, ${sec}s`);
    process.exit(0);
  } catch (err) {
    clearTimeout(timer);
    lastErr = err.name === "AbortError" ? `timeout` : err.message;
  }
}

console.log(`\n✗ 用完 ${MAX_RETRIES} 次 retry 仍失敗：${lastErr}`);
process.exit(1);

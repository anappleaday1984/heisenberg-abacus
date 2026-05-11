/**
 * 把 z_stranger 的普普漫畫氣質 × techlife 深色科技底融合成一張人像。
 *
 * 用法：node scripts/generate-stranger-techlife.mjs
 * 輸出：public/personas-techlife/z_stranger_techlife.png
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";
const MODEL = "flux";
const OUT = path.resolve("public/personas-techlife/z_stranger_techlife.png");
const REQ_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 5;

// 融合 prompt：
//   - 主體：完全純黑的人形剪影（無臉、無五官、無服裝、無皮膚細節）
//   - 環境：techlife 深色 slate-blue 科技底 + holographic UI panels + cyan/violet circuit
//   - 邊光：cyan/violet rim light 勾出剪影輪廓
const PROMPT = [
  `A flat 2D pure pitch-black human silhouette shape (like a paper cutout or shadow puppet) of a head-and-shoulders figure, centered in frame`,
  `The silhouette is filled with 100 percent uniform solid black color (RGB 0,0,0) — completely flat, no shading, no gradient, no nose shadow, no mouth, no eye sockets, no chin definition, no neck shadow, no skin texture, no clothing texture, no hair strands; absolutely zero internal detail; only the outer outline is visible`,
  `Behind the silhouette: a hyper-realistic dark tech environment — dark slate-blue and deep navy palette with floating holographic UI panels, translucent data interface elements, glowing cyan and electric violet circuit lines, soft bokeh blur, depth of field`,
  `Subtle cyan and violet glow softly outlining the edge of the black silhouette where it meets the bright tech background`,
  `The contrast is stark: the figure is pure void-black, the background is rich blue and luminous`,
  `Centered composition, head and shoulders crop, 8k resolution`,
  `No text, no logo, no watermark, no borders, no extra people, no visible face, no facial features at all, no clothing details, no skin tone, no hair detail`,
].join(". ");

function seedFor(label) {
  const h = crypto.createHash("sha256").update(label).digest();
  return h.readUInt32BE(0) % 1_000_000;
}

await fs.mkdir(path.dirname(OUT), { recursive: true });

const params = new URLSearchParams({
  width: "768",
  height: "768",
  seed: String(seedFor("z_stranger_techlife_v3_papercut")),
  model: MODEL,
  nologo: "true",
  private: "true",
  enhance: "true",
});
const url = `${POLLINATIONS_BASE}/${encodeURIComponent(PROMPT)}?${params}`;

console.log(`\n生成 z_stranger × techlife 融合人像 → ${path.relative(process.cwd(), OUT)}\n`);

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
    console.log(`  ✓ z_stranger_techlife → ${kb}KB, ${sec}s`);
    process.exit(0);
  } catch (err) {
    clearTimeout(timer);
    lastErr = err.name === "AbortError" ? `timeout` : err.message;
  }
}

console.log(`\n✗ 用完 ${MAX_RETRIES} 次 retry 仍失敗：${lastErr}`);
process.exit(1);

/**
 * 生成 N 張匿名 techlife 風格人像（不綁 persona）。
 *
 * 用法：
 *   node scripts/generate-anon-techlife.mjs                   # 預設 3 張
 *   node scripts/generate-anon-techlife.mjs --count=6
 *
 * 輸出：public/personas-techlife/anon_1.png ...
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";
const MODEL = "flux";
const OUTPUT_DIR = path.resolve("public/personas-techlife");
const REQ_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 5;

const args = process.argv.slice(2);
const count = Number(
  args.find((a) => a.startsWith("--count="))?.slice("--count=".length) ?? 3
);

// 匿名 persona 池 — 不綁 id，只控年齡 / 性別 / 氣質的多樣性
const ANON_VARIANTS = [
  { ageBucket: "late-20s", gender: "woman", vibe: "creative freelancer, warm energetic smile" },
  { ageBucket: "early-30s", gender: "man", vibe: "casual tech worker, relaxed confident expression" },
  { ageBucket: "mid-40s", gender: "woman", vibe: "thoughtful professional, gentle bright expression" },
  { ageBucket: "early-20s", gender: "man", vibe: "curious student-type, lively and friendly" },
  { ageBucket: "50s", gender: "man", vibe: "experienced calm presence, kind eyes" },
  { ageBucket: "late-30s", gender: "woman", vibe: "modern entrepreneur, bright assertive smile" },
  { ageBucket: "60s", gender: "woman", vibe: "graceful tech-savvy senior, content expression" },
  { ageBucket: "late-20s", gender: "man", vibe: "indie creator vibe, casual approachable" },
  { ageBucket: "early-40s", gender: "man", vibe: "seasoned pro, focused but friendly" },
  { ageBucket: "early-30s", gender: "woman", vibe: "design / product type, sharp curious gaze" },
];

function buildPrompt(v) {
  return [
    `Cinematic editorial portrait of a ${v.ageBucket} Asian ${v.gender}, ${v.vibe}`,
    `Dark tech-themed background with subtle holographic UI panels and soft circuit-line accents (cyan / violet glow), bokeh blur`,
    `Character has a vibrant, cheerful, energetic expression that reflects their personality — feels alive and approachable, not corporate`,
    `Modern casual lifestyle wear (relaxed jacket, t-shirt, denim, etc.), natural relaxed posture`,
    `Soft rim lighting in cyan or violet against dark slate-blue background, gentle key light on face`,
    `Hyper-realistic, sharp focus on character with soft tech bokeh, head and shoulders portrait crop`,
    `8k resolution, single subject, centered composition`,
    `No text, no logo, no watermark, no borders, no extra people`,
  ].join(". ");
}

function seedFor(label) {
  const h = crypto.createHash("sha256").update(label).digest();
  return h.readUInt32BE(0) % 1_000_000;
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });

const variants = ANON_VARIANTS.slice(0, count);
console.log(
  `\n生成 ${variants.length} 張匿名 techlife 人像 → ${path.relative(process.cwd(), OUTPUT_DIR)}/\n`
);

for (let i = 0; i < variants.length; i++) {
  const v = variants[i];
  const label = `anon_${i + 1}`;
  const dest = path.join(OUTPUT_DIR, `${label}.png`);

  const params = new URLSearchParams({
    width: "768",
    height: "768",
    seed: String(seedFor(label)),
    model: MODEL,
    nologo: "true",
    private: "true",
    enhance: "true",
  });
  const url = `${POLLINATIONS_BASE}/${encodeURIComponent(buildPrompt(v))}?${params}`;

  const t0 = Date.now();
  let saved = false;
  let lastErr = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const wait = Math.min(5_000 * Math.pow(2, attempt - 1), 60_000);
      const jitter = Math.random() * 0.3 + 0.85;
      await new Promise((r) => setTimeout(r, Math.floor(wait * jitter)));
      console.log(`    ↻ ${label} retry #${attempt}`);
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
        console.log(`  ✗ ${label}：HTTP ${resp.status}`);
        break;
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
      await fs.writeFile(dest, buf);
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      const kb = (buf.length / 1024).toFixed(0);
      console.log(`  ✓ ${label} (${v.ageBucket} ${v.gender}) → ${kb}KB, ${sec}s`);
      saved = true;
      break;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err.name === "AbortError" ? `timeout` : err.message;
    }
  }
  if (!saved) console.log(`  ✗ ${label} 失敗：${lastErr}`);
}

console.log(`\n完成。輸出在 ${path.relative(process.cwd(), OUTPUT_DIR)}/`);

import fs from "fs";
import path from "path";

const LOG_PATH = path.join(process.cwd(), "z_web_log.html");
const TOC_MARKER = "<!-- LOG_TOC -->";
const ENTRIES_MARKER = "<!-- LOG_ENTRIES -->";

export type LogEntry = {
  startedAt: Date;
  durationMs: number;
  prompt: string;
  personaCount: number;
  summary: string;
  success: boolean;
  error?: string;
};

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function localTimestamp(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function entryId(ts: string): string {
  return "entry-" + ts.replace(/[: ]/g, "-");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(s: string): string {
  return s.replace(/\n/g, "<br>\n");
}

function formatTocItem(e: LogEntry): string {
  const ts = localTimestamp(e.startedAt);
  const headline = e.prompt.split("\n")[0].slice(0, 40);
  const status = e.success ? "✅" : "⚠️";
  const ellipsis = headline.length === 40 ? "…" : "";
  return `  <li><a href="#${entryId(ts)}">${status} ${ts} — ${escapeHtml(headline)}${ellipsis}</a></li>`;
}

function formatEntry(e: LogEntry): string {
  const ts = localTimestamp(e.startedAt);
  const id = entryId(ts);
  const seconds = (e.durationMs / 1000).toFixed(1);
  const firstLine = e.prompt.split("\n")[0];
  const sliced = firstLine.slice(0, 40);
  const headline = escapeHtml(sliced);
  const ellipsis = sliced.length === 40 ? "…" : "";
  const status = e.success ? "✅" : "⚠️";

  const errorBlock = e.error
    ? `<p><strong>錯誤</strong></p>\n<blockquote><pre><code>${escapeHtml(e.error)}</code></pre></blockquote>\n`
    : "";

  return `<article class="log-entry">
<h2 id="${id}">${status} ${ts} — ${headline}${ellipsis}</h2>
<table>
<thead><tr><th>欄位</th><th>內容</th></tr></thead>
<tbody>
<tr><td><strong>執行時間</strong></td><td>${ts}</td></tr>
<tr><td><strong>回覆所需時間</strong></td><td>${seconds} 秒</td></tr>
<tr><td><strong>訪談受訪者數</strong></td><td>${e.personaCount}</td></tr>
<tr><td><strong>狀態</strong></td><td>${e.success ? "成功" : "失敗"}</td></tr>
</tbody>
</table>
<p><strong>Prompt</strong></p>
<blockquote><p>${nl2br(escapeHtml(e.prompt))}</p></blockquote>
<p><strong>回覆摘要</strong></p>
<blockquote><p>${nl2br(escapeHtml(e.summary || "(無內容)"))}</p></blockquote>
${errorBlock}<hr>
</article>
`;
}

const SHELL_CSS = `
  :root {
    --bg: #fafaf9;
    --fg: #1c1917;
    --muted: #57534e;
    --accent: #7c3aed;
    --code-bg: #f1f5f9;
    --code-fg: #334155;
    --border: #e7e5e4;
    --quote-bg: #f5f3ff;
    --table-head: #f5f5f4;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif;
    font-size: 16px;
    line-height: 1.75;
    -webkit-font-smoothing: antialiased;
  }
  main {
    max-width: 920px;
    margin: 0 auto;
    padding: 48px 32px 96px;
  }
  h1 {
    font-size: 2rem;
    border-bottom: 2px solid var(--fg);
    padding-bottom: 0.4em;
    margin-top: 0;
  }
  h1 + p em {
    color: var(--muted);
    font-style: normal;
    font-size: 0.95rem;
  }
  .toc {
    margin: 2em 0;
    padding: 18px 22px;
    background: var(--quote-bg);
    border-radius: 8px;
    border: 1px solid var(--border);
  }
  .toc h3 {
    margin: 0 0 10px;
    font-size: 0.85rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .toc ul {
    list-style: none;
    padding-left: 0;
    margin: 0;
    max-height: 320px;
    overflow-y: auto;
  }
  .toc li { margin: 4px 0; }
  .toc a {
    color: var(--accent);
    text-decoration: none;
    font-size: 0.9rem;
  }
  .toc a:hover { text-decoration: underline; }
  h2 {
    font-size: 1.25rem;
    margin-top: 2.8em;
    padding: 14px 18px;
    background: var(--quote-bg);
    border-left: 4px solid var(--accent);
    border-radius: 0 6px 6px 0;
    line-height: 1.5;
    scroll-margin-top: 20px;
  }
  hr {
    border: 0;
    border-top: 2px dashed var(--border);
    margin: 3em 0;
  }
  table {
    border-collapse: collapse;
    margin: 1em 0;
    width: 100%;
    font-size: 0.95rem;
  }
  th, td {
    border: 1px solid var(--border);
    padding: 8px 14px;
    text-align: left;
    vertical-align: top;
  }
  th { background: var(--table-head); font-weight: 600; }
  td:first-child, th:first-child { width: 30%; white-space: nowrap; }
  blockquote {
    border-left: 3px solid var(--border);
    background: #f8fafc;
    padding: 12px 18px;
    margin: 0.8em 0;
    border-radius: 0 4px 4px 0;
    font-size: 0.92rem;
    overflow-x: auto;
  }
  blockquote p { margin: 0.3em 0; }
  blockquote pre {
    background: var(--code-bg);
    padding: 10px 14px;
    border-radius: 4px;
    margin: 0.6em 0;
    overflow-x: auto;
  }
  blockquote code {
    background: transparent;
    color: var(--code-fg);
    font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
    font-size: 0.82rem;
    line-height: 1.5;
  }
  code {
    background: var(--code-bg);
    color: var(--code-fg);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
    font-size: 0.85em;
  }
  pre {
    background: var(--code-bg);
    padding: 12px 16px;
    border-radius: 6px;
    overflow-x: auto;
  }
  pre code { background: transparent; padding: 0; font-size: 0.85rem; line-height: 1.55; }
  ul, ol { padding-left: 1.6em; }
  li { margin: 0.3em 0; }
  strong { color: #0c0a09; }
  a { color: var(--accent); }
  .back-to-top {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: var(--accent);
    color: #fff;
    font-size: 1.2rem;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);
    z-index: 1000;
    transition: transform 0.15s;
  }
  .back-to-top:hover { transform: translateY(-2px); }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1c1917;
      --fg: #f5f5f4;
      --muted: #a8a29e;
      --accent: #a78bfa;
      --code-bg: #292524;
      --code-fg: #e7e5e4;
      --border: #44403c;
      --quote-bg: #2a1f3d;
      --table-head: #292524;
    }
    strong { color: #fafaf9; }
    blockquote { background: #1f1d1a; }
  }
`;

function buildShell(): string {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>海森堡的算盤 — 對話 Log</title>
<style>${SHELL_CSS}</style>
</head>
<body>
<main>
<h1>海森堡的算盤 — 對話 Log</h1>
<p><em>自動產生,新的紀錄放最前面</em></p>
<nav class="toc">
<h3>目錄</h3>
<ul>
${TOC_MARKER}
</ul>
</nav>
${ENTRIES_MARKER}
</main>
<button class="back-to-top" onclick="window.scrollTo({top:0,behavior:'smooth'})" aria-label="回到最上面">↑</button>
</body>
</html>
`;
}

/**
 * 將紀錄追加到 log 檔最前面(緊接在 marker 之後)。
 * 檔案不存在或缺 marker 時自動建立 / 補結構。
 */
export function appendLog(entry: LogEntry): void {
  const entryBlock = formatEntry(entry);
  const tocLine = formatTocItem(entry);

  let existing = "";
  if (fs.existsSync(LOG_PATH)) {
    existing = fs.readFileSync(LOG_PATH, "utf-8");
  }
  if (!existing.includes(TOC_MARKER) || !existing.includes(ENTRIES_MARKER)) {
    existing = buildShell();
  }

  const tocIdx = existing.indexOf(TOC_MARKER) + TOC_MARKER.length;
  let next =
    existing.slice(0, tocIdx) + "\n" + tocLine + existing.slice(tocIdx);

  const entriesIdx = next.indexOf(ENTRIES_MARKER) + ENTRIES_MARKER.length;
  next =
    next.slice(0, entriesIdx) + "\n" + entryBlock + next.slice(entriesIdx);

  fs.writeFileSync(LOG_PATH, next, "utf-8");
}

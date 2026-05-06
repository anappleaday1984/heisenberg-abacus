import fs from "fs";
import path from "path";

const LOG_PATH = path.join(process.cwd(), "z_wth_log.md");
const HEADER = "# 海森堡的算盤 — 對話 Log\n\n_自動產生，新的紀錄放最前面_\n\n";

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

function quoteBlock(text: string): string {
  return text
    .trim()
    .split("\n")
    .map((l) => "> " + l)
    .join("\n");
}

function formatEntry(e: LogEntry): string {
  const ts = localTimestamp(e.startedAt);
  const seconds = (e.durationMs / 1000).toFixed(1);
  const headline = e.prompt.split("\n")[0].slice(0, 40);
  const status = e.success ? "✅" : "⚠️";

  return `## ${status} ${ts} — ${headline}${headline.length === 40 ? "…" : ""}

| 欄位 | 內容 |
|---|---|
| **執行時間** | ${ts} |
| **回覆所需時間** | ${seconds} 秒 |
| **訪談受訪者數** | ${e.personaCount} |
| **狀態** | ${e.success ? "成功" : "失敗"} |

**Prompt**

${quoteBlock(e.prompt)}

**回覆摘要**

${quoteBlock(e.summary || "(無內容)")}
${e.error ? `\n**錯誤**\n\n${quoteBlock(e.error)}\n` : ""}
---
`;
}

/**
 * 將紀錄追加到 log 檔最前面（緊接在 H1 標頭之後）。
 * 檔案不存在時自動建立。
 */
export function appendLog(entry: LogEntry): void {
  const block = formatEntry(entry);

  let existing: string;
  if (fs.existsSync(LOG_PATH)) {
    existing = fs.readFileSync(LOG_PATH, "utf-8");
    if (!existing.startsWith("# ")) {
      // 檔案內容沒有預期的 H1，乾脆重建
      existing = HEADER;
    }
  } else {
    existing = HEADER;
  }

  // 找出 H1 區塊（H1 行 + 隨後的空行/說明）的結尾，作為插入點
  const lines = existing.split("\n");
  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      insertAt = i;
      break;
    }
    insertAt = i + 1;
  }

  const before = lines.slice(0, insertAt).join("\n").replace(/\n+$/, "") + "\n\n";
  const after = lines.slice(insertAt).join("\n");

  const next = before + block + (after.startsWith("\n") ? "" : "\n") + after;
  fs.writeFileSync(LOG_PATH, next, "utf-8");
}

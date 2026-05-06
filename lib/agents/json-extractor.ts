/**
 * 從 LLM 回應文字裡盡力撈出合法 JSON。
 * MiniMax-M2.5 偶爾會：
 *   - 不加 ```json fenced block 直接吐 JSON
 *   - 用 ``` 不加 language tag
 *   - 在 JSON 前後加 narration 文字
 *   - 用 \`\`\`JSON 大寫 / 多餘空白
 *   - **字串內含字面換行**（標準 JSON 不合法，須跳脫成 \\n）
 *   - 用彎引號（“ ”）而非標準 ASCII 雙引號
 *   - trailing comma
 *
 * 順序：fenced(json) → fenced(任意) → 找第一個 { 到最後一個 } 的子字串 → array 版
 * 每個 candidate 嘗試多種修復策略。
 */
export function extractJson<T = unknown>(text: string, agentName: string): T {
  if (!text || !text.trim()) {
    throw new Error(`${agentName} 沒有回傳任何內容（max_tokens 可能用完了）`);
  }

  const candidates: string[] = [];

  for (const m of text.matchAll(/```json\s*([\s\S]*?)```/gi)) {
    candidates.push(m[1]);
  }
  for (const m of text.matchAll(/```(?:[a-zA-Z]*)?\s*([\s\S]*?)```/g)) {
    candidates.push(m[1]);
  }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    candidates.push(text.slice(firstBracket, lastBracket + 1));
  }

  for (const c of candidates) {
    const cleaned = c.trim().replace(/^﻿/, ""); // strip BOM
    if (!cleaned) continue;

    // 嘗試一連串修復策略，每次嘗試都試 parse
    const attempts = [
      cleaned,
      // 1. 移除 trailing comma
      cleaned.replace(/,(\s*[}\]])/g, "$1"),
      // 2. 替換彎引號為直引號
      cleaned.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"),
      // 3. 字串內字面換行 → \n（最常見的 LLM 錯誤）
      escapeUnescapedNewlines(cleaned),
      // 4. 同時做 trailing comma + 換行修復
      escapeUnescapedNewlines(cleaned.replace(/,(\s*[}\]])/g, "$1")),
      // 5. 完整修復：彎引號 + trailing comma + 換行
      escapeUnescapedNewlines(
        cleaned
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'")
          .replace(/,(\s*[}\]])/g, "$1")
      ),
    ];

    for (const attempt of attempts) {
      try {
        return JSON.parse(attempt) as T;
      } catch {
        // continue
      }
    }
  }

  // 全部失敗 — log 完整原文到 server console，方便 debug
  // eslint-disable-next-line no-console
  console.error(
    `[json-extractor] ${agentName} JSON parse 失敗。完整原文：\n${text}\n---END---`
  );

  throw new Error(
    `${agentName} 沒有回傳合法 JSON（試了 ${candidates.length} 個 candidate × 6 種修復）。原始輸出前 600 字：\n${text.slice(0, 600)}`
  );
}

/**
 * 把字串值內的字面 \n / \r 跳脫為 \\n。
 * 簡化策略：用狀態機掃描，僅在字串值內（雙引號之間）做替換。
 * 不完美但能處理絕大多數 MiniMax 的常見 case。
 */
function escapeUnescapedNewlines(s: string): string {
  let out = "";
  let inString = false;
  let prev = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && prev !== "\\") {
      inString = !inString;
      out += ch;
    } else if (inString && (ch === "\n" || ch === "\r")) {
      out += ch === "\n" ? "\\n" : "\\r";
    } else if (inString && ch === "\t") {
      out += "\\t";
    } else {
      out += ch;
    }
    prev = ch === "\\" && prev === "\\" ? "" : ch;
  }
  return out;
}

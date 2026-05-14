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
 *   - **輸出被截斷**：max_tokens 用光、stream 中斷、或 stop_reason 未正確回 max_tokens
 *     (MiniMax 相容性常見) → JSON 還在開放狀態 (有 `{[`、字串未閉、結尾是 `,`/`:`)
 *
 * 順序：fenced(json) → fenced(任意) → 找第一個 { 到最後一個 } 的子字串 → array 版
 * 每個 candidate 嘗試多種修復策略，最後嘗試 auto-close (補閉合括號)。
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
  // 截斷救援:也保留 "從 { 開始到結尾" 這個版本給 auto-close 用
  // (lastBrace 可能是字串內的 `}` 字符,實際輸出根本沒走到完整結尾)
  if (firstBrace >= 0) {
    candidates.push(text.slice(firstBrace));
  }
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    candidates.push(text.slice(firstBracket, lastBracket + 1));
  }
  if (firstBracket >= 0) {
    candidates.push(text.slice(firstBracket));
  }

  let autoClosedUsed = false;

  for (const c of candidates) {
    const cleaned = c.trim().replace(/^﻿/, ""); // strip BOM
    if (!cleaned) continue;

    // 嘗試一連串修復策略，每次嘗試都試 parse
    const fullyRepaired = escapeUnescapedNewlines(
      cleaned
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,(\s*[}\]])/g, "$1")
    );
    const attempts: string[] = [
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
      fullyRepaired,
    ];
    // 6. Auto-close: 用 stack 追未閉的 { [ "，補上後再試 parse
    //    (處理 LLM 截斷在 metrics array 中間 / 字串中間的 case)
    const autoClosed = autoCloseJson(fullyRepaired);
    if (autoClosed && autoClosed !== fullyRepaired) {
      attempts.push(autoClosed);
      autoClosedUsed = true;
    }

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

  // 偵測「JSON 被截斷」這個常見原因
  // 改用 bracket-balance 判斷:看開閉合括號是否平衡、字串是否還在開放狀態
  // (純看結尾字符會被 LLM 偶然寫到的 `}` 騙過)
  const trimmed = text.trim();
  const looksLikeStartedJson = trimmed.includes("{") || trimmed.includes("[");
  const balance = analyzeJsonBalance(trimmed);
  const isTruncated = looksLikeStartedJson && (balance.unclosedBraces > 0 || balance.unclosedBrackets > 0 || balance.stringOpen);
  if (isTruncated) {
    const reasons: string[] = [];
    if (balance.unclosedBraces > 0) reasons.push(`${balance.unclosedBraces} 個 { 未閉`);
    if (balance.unclosedBrackets > 0) reasons.push(`${balance.unclosedBrackets} 個 [ 未閉`);
    if (balance.stringOpen) reasons.push(`字串未閉`);
    throw new Error(
      `${agentName} 的 JSON 輸出被截斷（${reasons.join("、")}） — max_tokens 用光、stream 中斷、或 stop_reason 未正確回報。建議:減少受訪者數量、調高 max_tokens、或重試。原始輸出最後 300 字:\n${text.slice(-300)}`
    );
  }

  throw new Error(
    `${agentName} 沒有回傳合法 JSON（試了 ${candidates.length} 個 candidate × ${autoClosedUsed ? 7 : 6} 種修復含 auto-close）。原始輸出前 600 字:\n${text.slice(0, 600)}`
  );
}

/**
 * 分析 JSON 候選字串的括號平衡與字串狀態。
 * 用簡化的狀態機掃描,跳過字串內容(不算內部的 `{` `[` `}` `]`)。
 */
function analyzeJsonBalance(s: string): {
  unclosedBraces: number;
  unclosedBrackets: number;
  stringOpen: boolean;
} {
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\\" && inString) {
      i += 2;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
    } else if (!inString) {
      if (ch === "{") braces++;
      else if (ch === "}") braces--;
      else if (ch === "[") brackets++;
      else if (ch === "]") brackets--;
    }
    i++;
  }
  return {
    unclosedBraces: Math.max(0, braces),
    unclosedBrackets: Math.max(0, brackets),
    stringOpen: inString,
  };
}

/**
 * 嘗試補上缺少的閉合括號 / 引號,還原一個可 parse 的 JSON。
 *
 * 策略:
 *   1. 用 stack 追未閉的 `{` `[`
 *   2. 掃到字串開放狀態,先補 `"` 收尾
 *   3. 把結尾的 `,` 或 `:` 之後的不完整值剝掉 (例:`"label": ` 補成 `"label": null`)
 *   4. 按 stack 反序補上對應的 `}` 或 `]`
 *
 * 不是完美的 JSON 修復(無法補回字串中間缺的字),只是「盡力恢復可解析的最大子集」。
 * 配 SummaryData/PMPlan 的欄位 fallback (`?? ""` / `?? []`) 用,救得回大部分 case。
 */
function autoCloseJson(s: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let inEscape = false;
  let lastNonStringChar = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inEscape) {
      inEscape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      inEscape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      if (!inString) lastNonStringChar = '"';
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") {
      stack.push(ch);
      lastNonStringChar = ch;
    } else if (ch === "}") {
      const top = stack[stack.length - 1];
      if (top === "{") stack.pop();
      else return null; // 結構錯亂,不嘗試修復
      lastNonStringChar = ch;
    } else if (ch === "]") {
      const top = stack[stack.length - 1];
      if (top === "[") stack.pop();
      else return null;
      lastNonStringChar = ch;
    } else if (!/\s/.test(ch)) {
      lastNonStringChar = ch;
    }
  }

  if (!inString && stack.length === 0) return null; // 已經平衡,不需 auto-close

  let body = s;
  // 步驟 2:若字串還開著,先補一個 `"`
  if (inString) {
    body += '"';
    lastNonStringChar = '"';
  }
  // 步驟 3:處理結尾的「不完整 token」
  //   - 結尾是 `,` 或 `[ ` 後沒值 → 剝掉
  //   - 結尾是 `:` (key 後沒 value) → 補 null
  body = body.replace(/[\s,]+$/, "");
  if (/:\s*$/.test(body)) body += " null";
  // 步驟 4:按 stack 反序補閉合
  while (stack.length > 0) {
    const open = stack.pop()!;
    body += open === "{" ? "}" : "]";
  }
  return body;
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

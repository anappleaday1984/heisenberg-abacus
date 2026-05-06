/**
 * 內部「驗證者」— 對 LLM agent 的 markdown 輸出做快速檢核 + 自動修復。
 *
 * MiniMax-M2.5 偶爾會把 markdown 表格全部擠在同一行（separator 跟 row 沒換行），
 * 直接送進 react-markdown 會 render 成一坨 raw 文字而非真正的表格。
 * 這個 validator 在 client render 前先做幾項常見格式修復。
 */

export type ValidationResult = {
  fixed: string;
  issues: string[];
};

/**
 * 修復 1：單行 markdown 表格 → 多行
 *
 * 病徵：`| h1 | h2 | |---|---| | r1c1 | r1c2 | | r2c1 | r2c2 |`
 * 結果：
 *     | h1 | h2 |
 *     |---|---|
 *     | r1c1 | r1c2 |
 *     | r2c1 | r2c2 |
 */
export function fixMalformedMarkdownTables(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      // 同一行有 separator pattern (|---|---|)
      const hasSeparator = /\|\s*[-:]+\s*\|\s*[-:]+/.test(line);
      if (!hasSeparator) return line;

      // 用 pipe 數量過濾：合法單行 table 不會這麼多 pipe；真正 malformed 通常 8+ pipes
      const pipeCount = (line.match(/\|/g) ?? []).length;
      if (pipeCount < 8) return line;

      // 把任何 「pipe + 一個以上空白 + pipe」（不論前後是否有空白）都拆成換行
      // 同時處理 ` | |`（row → row）跟 `| |`（separator 結尾 → row 開頭）
      return line.replace(/\|[ \t]+\|/g, "|\n|");
    })
    .join("\n");
}

/**
 * 修復 2：list 跟段落沒空行隔開（react-markdown 對縮排敏感）
 * 病徵：「結論：- 點 1- 點 2」會 render 成一行
 */
export function fixListSpacing(text: string): string {
  // 在「: -」這種冒號緊接 list 的位置補空行
  // （保守作法，避免破壞合法格式）
  return text.replace(/([^\n]):\s*\n?-\s/g, "$1：\n- ");
}

/**
 * 主入口：跑所有檢核，回傳修正後文字 + 偵測到的 issues。
 */
export function validateAndFixMarkdown(text: string): ValidationResult {
  const issues: string[] = [];
  let fixed = text;

  // 1. malformed tables
  const beforeTables = fixed;
  fixed = fixMalformedMarkdownTables(fixed);
  if (beforeTables !== fixed) {
    issues.push("malformed-table: 表格寫成單行已自動拆分");
  }

  // 2. list spacing (保守，不一定有用)
  // const beforeLists = fixed;
  // fixed = fixListSpacing(fixed);
  // if (beforeLists !== fixed) {
  //   issues.push("list-spacing: list 跟段落已加空行");
  // }

  return { fixed, issues };
}

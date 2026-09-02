import type Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "./json-extractor";

/**
 * 包住「呼叫 LLM → 抽 JSON → 驗證格式」並<b>內建重試（預設 3 次）</b>。
 *
 * 解決的問題：單一次模型回覆若被截斷（max_tokens 用光、stream 中斷）或內容夾帶
 * 符號／彎引號／未跳脫換行導致 JSON 解析失敗，整個調查就直接中斷。改成：
 *   1. 每次失敗（截斷 / 解析失敗 / 格式不符）都<b>重試</b>，最多 maxRetries 次。
 *   2. 重試時透過 request(attempt) 的 attempt 參數<b>拉高 max_tokens</b>，直接降低再次截斷的機率。
 *   3. <b>回覆前先過 validate 檢查格式</b>，不符也視為失敗觸發重試，確保回傳的物件結構正確。
 *
 * @param request 依 attempt（1..maxRetries）回傳一次 LLM 呼叫結果；closure 內可依 attempt 調 max_tokens。
 * @param opts.validate 回傳前的格式檢查；不符請 throw，會觸發下一次重試。
 */
export async function extractJsonWithRetry<T>(
  agentName: string,
  request: (attempt: number) => Promise<Anthropic.Message>,
  opts: { maxRetries?: number; validate?: (parsed: T) => void } = {}
): Promise<T> {
  const maxRetries = Math.max(1, opts.maxRetries ?? 3);
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await request(attempt);
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      // 截斷視為「可重試」— 下一輪 request(attempt) 會調高 max_tokens 再試。
      if (response.stop_reason === "max_tokens") {
        throw new Error(`${agentName} 輸出被截斷（max_tokens 用光）`);
      }

      const parsed = extractJson<T>(text, agentName);
      // 回覆前先檢查是否符合預期格式 — 不符就丟錯觸發重試。
      opts.validate?.(parsed);
      return parsed;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        console.warn(
          `[${agentName}] JSON 解析/格式檢查失敗，第 ${attempt}/${maxRetries} 次，重試中… ${
            (err as Error)?.message?.slice(0, 140) ?? ""
          }`
        );
      }
    }
  }

  // 全部重試用盡 — 丟出最後一個錯誤（含截斷診斷），交給上層的串流錯誤處理。
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`${agentName} JSON 在 ${maxRetries} 次重試後仍解析失敗`);
}

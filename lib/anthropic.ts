import Anthropic, { APIError } from "@anthropic-ai/sdk";

if (!process.env.MINIMAX_API_KEY) {
  throw new Error("MINIMAX_API_KEY is not set");
}

// MiniMax 提供 Anthropic SDK 相容的 endpoint，所以可以直接用 @anthropic-ai/sdk
// 只需要把 baseURL 指向 MiniMax 的 /anthropic 路徑
export const anthropic = new Anthropic({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: "https://api.minimax.io/anthropic",
  // 我們有自己的 retry（針對 429 + jitter），SDK 不要再多包一層
  maxRetries: 0,
});

export const MODEL = "MiniMax-M2.5";

// ---------- 全域 LLM 並行控制 + 429 retry ----------
//
// MiniMax Token Plan 是「個人開發者互動式工作流」級別的限流，30 位受訪者並行訪談
// 很容易踩到 429。我們在這裡蓋一層全域 semaphore 限制同時 in-flight 的 LLM 呼叫，
// 並對 429 / 5xx 做 exponential backoff + jitter retry。
//
// 所有 agent 呼叫 anthropic.messages.{create, stream} 都應該包在 callLLM() 裡面，
// 才能受這套限流保護。

// 預設 6：persona agent 改成 bundled JSON 後，30 受訪者場景的 LLM call 從 150
// 砍到 30，rate limit 壓力大減。benchmark 證實 c=6 還是 0 個 429（vs 逐題 c=3
// 35 個 429），wall time 79s（vs 逐題 c=3 127s 或舊架構 c=6 130s 但 < 90% 完成）。
// 想覆寫請設 .env LLM_MAX_CONCURRENCY=N。詳見 docs/benchmark-rate-2026-05-08.md
const DEFAULT_MAX_CONCURRENCY = 6;
// 8 次：concurrency 4 那輪 51 次 429 靠 retry 救活 48 次，預算多一點才能
// 吸收連續 429。每次失敗都 backoff，總體仍受 backoff 上限保護。
const DEFAULT_MAX_RETRIES = 8;
// 2000 ms：base 1s 第一次重試 jitter 後平均 0.5s，對 sustained 429 太短。
// 拉到 2000 後 attempt 0..7 的最大期望 backoff = 1+2+4+8+16+30+30+30 = ~120s（含 jitter）。
const DEFAULT_BACKOFF_BASE_MS = 2000;

class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];
  private _capacity: number;

  constructor(capacity: number) {
    this.available = capacity;
    this._capacity = capacity;
  }

  get capacity(): number {
    return this._capacity;
  }

  setCapacity(next: number): void {
    const delta = next - this._capacity;
    this._capacity = next;
    if (delta > 0) {
      this.available += delta;
      // 釋放新增的 permit 給 waiter
      for (let i = 0; i < delta; i++) {
        const w = this.waiters.shift();
        if (!w) break;
        this.available--;
        w();
      }
    } else {
      // 縮小容量：available 可能變負數，下次 release 會吸收
      this.available += delta;
    }
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    if (this.available < 0) {
      // 之前縮容造成的負債，先抵掉
      this.available++;
      return;
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter();
    } else {
      this.available++;
    }
  }

  inFlight(): number {
    return this._capacity - this.available;
  }

  pending(): number {
    return this.waiters.length;
  }
}

const initialCap = Number(
  process.env.LLM_MAX_CONCURRENCY ?? DEFAULT_MAX_CONCURRENCY
);
const llmSemaphore = new Semaphore(
  Number.isFinite(initialCap) && initialCap > 0
    ? initialCap
    : DEFAULT_MAX_CONCURRENCY
);

export function setLLMConcurrency(n: number): void {
  if (!Number.isFinite(n) || n <= 0) return;
  llmSemaphore.setCapacity(Math.floor(n));
}

export function getLLMConcurrency(): number {
  return llmSemaphore.capacity;
}

export function getLLMStats(): { inFlight: number; pending: number; capacity: number } {
  return {
    inFlight: llmSemaphore.inFlight(),
    pending: llmSemaphore.pending(),
    capacity: llmSemaphore.capacity,
  };
}

export type RetryStats = {
  attempts: number;
  rateLimitHits: number;
  totalBackoffMs: number;
};

// Process-wide telemetry — benchmark / debug 用
export type LLMTelemetry = {
  totalCalls: number;
  totalAttempts: number;
  rateLimitHits: number;
  serverErrors: number;
  totalBackoffMs: number;
};

const _tel: LLMTelemetry = {
  totalCalls: 0,
  totalAttempts: 0,
  rateLimitHits: 0,
  serverErrors: 0,
  totalBackoffMs: 0,
};

export function getLLMTelemetry(): LLMTelemetry {
  return { ..._tel };
}

export function resetLLMTelemetry(): void {
  _tel.totalCalls = 0;
  _tel.totalAttempts = 0;
  _tel.rateLimitHits = 0;
  _tel.serverErrors = 0;
  _tel.totalBackoffMs = 0;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof APIError) {
    if (err.status === 429) return true;
    if (typeof err.status === "number" && err.status >= 500 && err.status < 600) return true;
  }
  // 網路類錯誤（ECONNRESET、ETIMEDOUT）
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED") {
      return true;
    }
  }
  return false;
}

function computeBackoffMs(attempt: number, baseMs = DEFAULT_BACKOFF_BASE_MS): number {
  // Exponential: 2s, 4s, 8s, 16s, 32s→上限 30s
  const exp = Math.min(baseMs * 2 ** attempt, 30_000);
  // Full jitter: random in [0, exp]
  return Math.random() * exp;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 在全域 semaphore 之下執行 LLM 呼叫；遇 429/5xx/網路錯誤自動 retry。
 *
 * **重要**：對於 streaming 呼叫，整段 stream 消費都要在 fn 裡面完成，
 * 這樣 slot 才會在 stream 結束後才釋放（避免 stream 還沒讀完就放掉名額，
 * 後續呼叫又把 server 打爆）。
 */
/**
 * 低階 API — 取得一個 LLM slot，回傳 release 函式。
 *
 * 給 generator 形式的 stream（entry agent / query agent）用：generator 不能在
 * yield 中間 await `callLLM`，所以改用 acquire/release 控制 slot。
 *
 * **必須**搭配 try/finally 確保 release 一定被呼叫。
 */
export async function acquireLLMSlot(): Promise<() => void> {
  await llmSemaphore.acquire();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    llmSemaphore.release();
  };
}

export async function callLLM<T>(
  fn: (signal: { attempt: number }) => Promise<T>,
  opts?: { maxRetries?: number; onRetry?: (info: { attempt: number; err: unknown; waitMs: number }) => void; stats?: RetryStats }
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;
  await llmSemaphore.acquire();
  _tel.totalCalls++;
  try {
    let attempt = 0;
    while (true) {
      try {
        if (opts?.stats) opts.stats.attempts++;
        _tel.totalAttempts++;
        return await fn({ attempt });
      } catch (err) {
        if (err instanceof APIError) {
          if (err.status === 429) _tel.rateLimitHits++;
          else if (typeof err.status === "number" && err.status >= 500) _tel.serverErrors++;
        }
        if (!isRetryable(err) || attempt >= maxRetries) throw err;
        const waitMs = computeBackoffMs(attempt);
        if (opts?.stats) {
          if (err instanceof APIError && err.status === 429) {
            opts.stats.rateLimitHits++;
          }
          opts.stats.totalBackoffMs += waitMs;
        }
        _tel.totalBackoffMs += waitMs;
        opts?.onRetry?.({ attempt, err, waitMs });
        await sleep(waitMs);
        attempt++;
      }
    }
  } finally {
    llmSemaphore.release();
  }
}

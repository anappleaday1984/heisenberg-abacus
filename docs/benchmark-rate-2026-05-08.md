# Rate-Limit Benchmark Report

生成時間：2026-05-08T15:22:04Z
受測對象：MiniMax Anthropic-compatible API (`MiniMax-M2.5`)

## 測試設定
- Personas：30 位（同生產環境受訪者池全量）
- Questions：每位 5 題（總計 150 次 LLM call / 輪）
- 並行度：4 / 8 / 16（受 `LLM_MAX_CONCURRENCY` 控制的全域上限）
- Retry：429 / 5xx exponential backoff + jitter（最多 5 次，base 1s，上限 30s）

## 結果摘要

| 並行度 | wall time | 完成 / 失敗 | 429 命中 | 重試率 | 受訪者平均 | p50 | p95 | 總 backoff |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **3** ✅ | **3 m 40 s** | **30 / 0** | 35 | 23.3 % | 204 s | 205 s | 219 s | 1 m 24 s |
| 4 | 3 m 16 s | 27 / 3 | 51 | 32.6 % | 181 s | 184 s | 196 s | 1 m 46 s |
| 8 | 2 m 39 s | 12 / 18 | 208 | 169.6 % | 108 s | 135 s | 153 s | 9 m 1 s |
| 16 | 1 m 50 s | 1 / 29 | 244 | 221.6 % | 77 s | 85 s | 99 s | 11 m 16 s |

**重試率** = (totalAttempts − totalCalls) / totalCalls，> 100% 表示平均每個 call 都被擋至少一次以上。
✅ = 已採用為預設值（`LLM_MAX_CONCURRENCY=3`，2026-05-08 設定）。

## 結論

1. **並行度 3 是甜蜜點** — 30/30 完成、35 次 429 全被 retry 救回、wall time 比 4 只多 24 秒（+12%）。
2. **並行度 4 仍會死人** — 90% 完成率，3 位受訪者在用完 5 次 retry budget 後失敗，意味 MiniMax 高峰期的 429 是持續性的、不是短暫尖峰。
3. **並行度 8 不可用** — 失敗率 60%，主流程一半受訪者拿不到資料、報告會被半空答案污染。
4. **並行度 16 完全不可用** — 只 1 位完成。
5. **wall time 看似下降是錯覺** — 並行度 16 跑得快是因為 29 位受訪者直接擺爛拋錯不消耗時間，不代表跑得完。

## 行動建議（依優先序）

### ✅ 已套用（2026-05-08）：把預設拉到 3 並把 retry budget 拉長

[lib/anthropic.ts](lib/anthropic.ts) 預設值：

| 參數 | 舊 | 新 | 理由 |
|---|---:|---:|---|
| `LLM_MAX_CONCURRENCY` | 6 | **3** | 4 仍 10% 失敗、3 才 100% |
| `DEFAULT_MAX_RETRIES` | 5 | **8** | c3 實測 35 次 429，新 budget 給 headroom |
| `DEFAULT_BACKOFF_BASE_MS` | 1000 | **2000** | base 1s 第一次重試平均 0.5s，對 sustained 429 太短 |

`.env.local` 也同步加上 `LLM_MAX_CONCURRENCY=3` 確保部署環境吃到一致設定。

### 中優先：在 server 端加 request queueing 而非靠 client retry

目前 retry 還是會把已經被擋的 request 重打；如果限流是「每秒 N 次」型，重試本身會持續超出配額。可考慮：
- 在 callLLM 拿到 slot **之後**多加一個 token bucket（每秒最多 X 次發出去）
- 用 429 response 的 `retry-after` header 取代盲算 backoff（如果 MiniMax 有送的話）

### 低優先：升級到付費方案

MiniMax 的 429 訊息直接寫了：

> The Token Plan is designed for individual, interactive developer workflows... For higher concurrency or automated workloads, consider upgrading to a higher-tier plan or using the pay-as-you-go API.

如果真的要支援 30 訪客同時打就只能付費。Token Plan 連並行 4 都吃力，要支撐多訪客同時下單調查不現實。

## 詳細數據

### concurrency = 3 ✅（已採用）
- 總 LLM call：150（30 受訪者全部跑完所有 5 題）
- 總嘗試次數：185（含 retry）
- 429 命中：35（全部被 retry 吸收）
- 5xx 命中：0
- 受訪者完成：**30 / 30**
- wall time：220.3 s（3 m 40 s）
- backoff 累計：83.8 s

### concurrency = 4
- 總 LLM call：147（理論 150，3 位失敗少打了幾通）
- 總嘗試次數：195（含 retry）
- 429 命中：51
- 5xx 命中：0
- 受訪者完成：27 / 30
- wall time：195.9 s
- backoff 累計：105.8 s

### concurrency = 8
- 總 LLM call：112
- 總嘗試次數：302
- 429 命中：208
- 5xx 命中：0
- 受訪者完成：12 / 30
- wall time：158.8 s
- backoff 累計：540.8 s

### concurrency = 16
- 總 LLM call：97
- 總嘗試次數：312
- 429 命中：244
- 5xx 命中：0
- 受訪者完成：1 / 30
- wall time：110.5 s
- backoff 累計：675.6 s

## 原始 JSON

並行 3（後續單獨補測）：
```json
{"concurrency":3,"personas":30,"questions":5,"totalCalls":150,"totalAttempts":185,"rateLimitHits":35,"serverErrors":0,"retryRate":0.2333,"successCount":30,"failureCount":0,"wallTimeMs":220299,"perPersonaAvgMs":204494,"perPersonaP50Ms":205350,"perPersonaP95Ms":219099,"totalBackoffMs":83836}
```

並行 4 / 8 / 16（首輪測試）：
```json
{"config":{"personas":30,"questions":5,"totalCallsPerRun":150,"levels":[4,8,16]},"results":[{"concurrency":4,"personas":30,"questions":5,"totalCalls":147,"totalAttempts":195,"rateLimitHits":51,"serverErrors":0,"retryRate":0.3265,"successCount":27,"failureCount":3,"wallTimeMs":195939,"perPersonaAvgMs":181115,"perPersonaP50Ms":183738,"perPersonaP95Ms":195938,"totalBackoffMs":105788},{"concurrency":8,"personas":30,"questions":5,"totalCalls":112,"totalAttempts":302,"rateLimitHits":208,"serverErrors":0,"retryRate":1.6964,"successCount":12,"failureCount":18,"wallTimeMs":158821,"perPersonaAvgMs":107817,"perPersonaP50Ms":135358,"perPersonaP95Ms":153399,"totalBackoffMs":540814},{"concurrency":16,"personas":30,"questions":5,"totalCalls":97,"totalAttempts":312,"rateLimitHits":244,"serverErrors":0,"retryRate":2.2165,"successCount":1,"failureCount":29,"wallTimeMs":110457,"perPersonaAvgMs":76592,"perPersonaP50Ms":85084,"perPersonaP95Ms":98717,"totalBackoffMs":675607}]}
```

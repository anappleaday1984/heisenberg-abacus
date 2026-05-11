# 本機 Demo 備援 Runbook (Layer 1)

> 用途：當主 server 在 demo 時出狀況,demo 機可以在本機跑同一份程式碼當備援。
> 對象：Claude Code 在 demo 機上讀這份文件按步驟執行。
> 流程預計耗時:5-10 分鐘(網路順暢時)。

---

## 目標

在 demo 機跑出跟 server 完全相同的 app:
- `http://localhost:3000` 可登入
- 主頁能跑完整 pipeline(問問題 → 訪談 → 報告)
- `/simulation` 模擬艙正常運作
- LLM 呼叫成功(MiniMax endpoint)

---

## 前置檢查 (Claude Code 自動做)

執行下列指令確認環境就緒,任一項失敗就停下來跟使用者報告:

```bash
# 1. Node 版本 >= 18
node --version

# 2. npm 可用
npm --version

# 3. git 可用
git --version

# 4. 目前所在目錄(避免裝錯地方)
pwd
```

如果 Node < 18:
```bash
# 偵測有沒有 nvm
command -v nvm && nvm install 20 && nvm use 20

# 沒 nvm 就先裝 nvm(只在這台機器是 fresh setup 時)
# curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```

---

## Step 1 — 取得程式碼

```bash
# 選一個合理的工作目錄
mkdir -p ~/Desktop/demo-backup && cd ~/Desktop/demo-backup

# Clone 主 repo
git clone https://github.com/anappleaday1984/heisenberg-abacus.git
cd heisenberg-abacus

# 確認在 main branch 最新版
git status
git log --oneline -3
```

驗證:應該看到最新 commit 是 `擴充模擬艙：三層桑基、外部衝擊、名人模糊...` 之類的。

---

## Step 2 — 安裝依賴

```bash
npm install
```

預計 30-60 秒。沒報錯就 OK。

驗證:
```bash
ls node_modules/@anthropic-ai/sdk/package.json
# 應該存在
```

---

## Step 3 — 設定環境變數(關鍵 · 需要使用者貼祕密)

**這一步 Claude Code 要停下來請使用者人工輸入,因為 `.env.local` 是 gitignored,沒辦法從 repo 取得**。

請使用者:

1. 在 server 機器(`/Users/the_mini_bot/wth/`)執行:
   ```bash
   cat .env.local
   ```
2. 把整段內容貼給 Claude Code

Claude Code 收到內容後,寫入 `.env.local`:

```bash
# 把整段貼進來,然後 Ctrl+D 結束
cat > .env.local <<'EOF'
[使用者貼的內容貼這裡]
EOF

# 確認檔案有建,且不被 git 追蹤
ls -la .env.local
git status .env.local  # 應該回 "ignored"
```

**最少需要的變數**:

| 變數 | 必填 | 用途 |
|---|---|---|
| `MINIMAX_API_KEY` | ✅ | LLM 呼叫,沒這個整套不能跑 |
| `AUTH_USERS` | ✅ | 登入閘 udo/esun 帳號,少了登不進實驗室 |
| `LLM_MAX_CONCURRENCY` | ⚪ | 不填預設 6 |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | ⚪ | 寄信功能,demo 不一定要 |

---

## Step 4 — 帶過 personas 資料(避免人物池跟 server 不一致)

`data/` 在 `.gitignore` 內,clone 不會帶 `personas.json`。需要從 server 手動帶過來。

請使用者選一種方式:

**方式 A:** server 是同一台網路可達的機器 (推薦):
```bash
# 在 demo 機執行 — 假設 server 是 user@server.example.com 且 wth 在 home
scp user@SERVER_HOST:~/wth/data/personas.json ./data/personas.json

# 或 server 是這台 Mac 但另一個目錄:
cp /Users/the_mini_bot/wth/data/personas.json ./data/personas.json
```

**方式 B:** server 不可達 (USB / 雲端硬碟搬):
```bash
mkdir -p data
# 把 personas.json 拖進去,確認長度
ls -la data/personas.json
head -3 data/personas.json
```

驗證:
```bash
# personas.json 應該是合法 JSON array
node -e "const d = JSON.parse(require('fs').readFileSync('data/personas.json','utf-8')); console.log('personas count:', d.length)"
# 應該印 personas count: 30 (或當前 server 上的數量)
```

---

## Step 5 — 開發伺服器跑跑看

```bash
# 跑 Next.js dev server
npm run dev
```

預期輸出:
```
▲ Next.js 14.x.x
- Local:        http://localhost:3000
```

如果 3000 已被占用:
```bash
# 改 port (3001)
PORT=3001 npm run dev
```

驗證(在另一個 terminal 或瀏覽器):
```bash
# 健康檢查 — 應該回 200
curl -I http://localhost:3000

# 拉首頁 HTML,看是否含 "海森堡" 之類關鍵字
curl -s http://localhost:3000 | grep -o '海森堡' | head -1
```

---

## Step 6 — 端到端煙霧測試 (smoke test)

請使用者打開瀏覽器測試:

1. 開 `http://localhost:3000`,看到實驗室入口動畫
2. 用 `udo` 帳號登入(密碼從 server 的 AUTH_USERS 抓)
3. 點任一 `PRODUCT_EXAMPLES` (推薦從 💰 微型信貸 開始)
4. 等 pipeline 跑完,確認:
   - 受訪者顯影出現 30 位
   - QA 探索器可翻頁
   - 報告卡能完整生成
5. 切到 `/simulation` 模擬艙,確認:
   - 行為相變散佈圖正常
   - 三層桑基有絲帶
   - 底部 AbacusBar 利率 + 通膨 + 失業滑桿可拖
   - 拖任何滑桿,散佈圖跟桑基會即時重畫

如果 LLM 連線正常但卡某一階段太久,可能是 MiniMax 那邊塞車 — 看 server console 有沒有 429 / timeout。

---

## Step 7 — Production build (選做,demo 前一晚跑)

`npm run dev` 雖然方便但每次改檔會 hot reload,demo 時偶爾會卡。正式 demo 建議用 production build:

```bash
# Build
npm run build

# 起 production server
npm run start
```

`npm run start` 預設也是 3000 port,效能更好、不會 hot reload。

如果 build 失敗,大多是型別錯誤 — 把錯誤訊息貼給 Claude Code 排查。

---

## Demo 當天 Cheat Sheet

在投影出去之前先做:

```bash
# 1. 確認 dev / start server 還跑著
curl -I http://localhost:3000

# 2. 確認登入頁能載入
curl -s http://localhost:3000 | head -3

# 3. 確認 LLM 端點可達 (避免到 demo 才發現網路被擋)
# 從 .env.local 抓金鑰,呼一下健康檢查
source .env.local 2>/dev/null
curl -s -o /dev/null -w "LLM endpoint: %{http_code}\n" \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  https://api.minimaxi.chat/v1/

# 4. 主 server URL 開一頁、本機 localhost 開一頁 — server 卡了直接切視窗
```

**手機熱點當 backup**:會場 WiFi 不一定能對外打 MiniMax。準備好手機熱點切換。

---

## 故障排除

| 症狀 | 大概原因 | 解法 |
|---|---|---|
| `npm install` 卡在某個套件 | 鏡像源慢 | `npm install --registry=https://registry.npmmirror.com` |
| 起 dev 後 ENOENT data/personas.json | Step 4 沒做 | 回 Step 4 帶 personas.json 過來 |
| 登入頁 401 | AUTH_USERS 沒設或密碼錯 | 檢查 .env.local 的 AUTH_USERS |
| pipeline 卡在「對話者訪談」 | LLM 429 限流 / 網路慢 | 把 LLM_MAX_CONCURRENCY 降到 3、重試 |
| pipeline 噴 Invalid JSON | LLM 回應被截斷 | 通常 retry 一次就好;持續失敗看 server console |
| 散佈圖空白 | personas 沒帶過來 | 回 Step 4 |
| 桑基沒絲帶 | QA entries 還沒跑完 | 等 pipeline 跑完整段 |

---

## 完成檢查清單

讓 Claude Code 跑完後跟使用者確認:

- [ ] Node 18+ 已就緒
- [ ] `git clone` 成功,在 main branch 最新 commit
- [ ] `npm install` 完成、無錯誤
- [ ] `.env.local` 已建立,含 MINIMAX_API_KEY 與 AUTH_USERS
- [ ] `data/personas.json` 已從 server 帶過來
- [ ] `npm run dev` 起得來,`http://localhost:3000` 可訪問
- [ ] 用 udo 帳號登入成功
- [ ] 點微型信貸範例,完整 pipeline 跑完
- [ ] `/simulation` 模擬艙正常

全勾 = Layer 1 備援就緒。

---

## 下一步 (Layer 2, 選做)

如果 demo 時連 LLM 都掛,Layer 1 也救不了。Layer 2 是「預錄三個範例的完整回應 → 從快取 replay」,可以在 0 網路下 demo。

實作大綱(留給未來做):
1. 在 `lib/anthropic.ts` 加 disk cache:`hash(prompt+role)` → JSON
2. 跑過一輪三個 PRODUCT_EXAMPLES,把回應寫入 `data/llm-cache/`
3. 加 env var `REPLAY_MODE=1`,啟動時改讀 cache、跳過 LLM 呼叫
4. demo 前 export cache 到 demo 機

需要時再來 build。

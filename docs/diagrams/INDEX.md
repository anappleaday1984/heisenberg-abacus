# Diagrams 對照表

這些 PNG 由 `npm run diagrams` 從 `docs/architecture.md` 與 `docs/qa-support.md` 自動產出。改文件後重跑即可。

## 來自 `architecture.md`

| 圖檔 | 對應章節 |
|---|---|
| `arch-1.png` | §1 系統架構（高層） |
| `arch-2.png` | §2 Multi-agent 序列圖 |
| `arch-3.png` | §3 資料流（client state） |
| `arch-4.png` | §4 路由與 UI 元件樹 |
| `arch-5.png` | §6 部署架構（最簡） |
| `arch-6.png` | §7 技術 stack mindmap |

## 來自 `qa-support.md`

| 圖檔 | 對應章節 |
|---|---|
| `qa-1.png` | §0 5 分鐘 mental model |
| `qa-2.png` | §1 三條主要使用路徑 |
| `qa-3.png` | §2 Q8 算盤珠運作原理 |
| `qa-4.png` | §4 帳號權限結構 |
| `qa-5.png` | §5 故障排除流程圖 |

## 重新生成

```bash
npm run diagrams
```

需要 macOS / Linux 有 Chromium 可用（mac 上 puppeteer 會自動下載）。

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// ===== 對外 CustomEvent 名稱 =====
// 各元件監聽自己關心的事件；VoiceControl 依 LLM 判讀結果 dispatch 對應 event。
export const VOICE_EMAIL_REPORT_EVENT = "voice:email-report";
export const VOICE_DOWNLOAD_PDF_EVENT = "voice:download-pdf";
export const VOICE_RESTART_EVENT = "voice:restart";
// 服務 QA 打開事件 — ServiceFAQ.tsx 監聽。若使用者不在 /admin 頁,
// VoiceControl 會先 router.push 過去再 sessionStorage 留 flag 讓 ServiceFAQ mount 後自動開啟。
export const VOICE_OPEN_FAQ_EVENT = "voice:open-faq";
export const VOICE_OPEN_FAQ_SESSION_KEY = "voice:openFaq";
// 語音肥皂上的「回到入口」按鈕觸發 — ChatInterface 監聽後用內部 scrollRef 捲頂。
// 不能用 window.scrollTo({top:0})，因為聊天區是 flex-1 overflow-y-auto 的內層容器。
export const APP_SCROLL_TOP_EVENT = "app:scroll-top";

// ===== Web Speech API 型別補丁 =====
interface SpeechRecognitionAlternative {
  readonly transcript: string;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResult>;
}
interface SpeechRecognitionErrorEvent {
  readonly error: string;
}
interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

// ===== 喚醒詞 =====
// 目標：「Hey Heisenberg / Heisenberg / 嘿海森堡 / 海森博 / 黑森伯格 / …」中英任何
// 發音類似都能喚醒。zh-TW SpeechRecognition 對英文人名轉寫變化極大，直接列舉所有
// 常見發音組合：
//
// 英文分支：
//   - 完整 heisen(berg|burg|burgh)
//   - 拆解前綴 (hey|hai|hei|hy|high|hi|ha) + 中段 (sen|zen|son) + 可選 (berg|burg)
//     → 涵蓋 highzen / hyzenberg / hi-sen / hey zen burg 等同音變體
//
// 中文分支（zh-TW SR 把英文「Heisenberg」轉寫的常見變體）：
//   首字 [海嗨嘿黑哈] (5 種)
//   ├── 中段 [森生新星心] (5 種)
//   ├──── 末字 [堡伯博保包抱勃柏] (8 種)
//   └────── 可選後綴 [格爵]?
//   組合 = 5×5×8×3 = 600 種變體，包含 海森堡/嘿森博/黑森伯/嗨生伯格/哈森伯爵…
//
// 不用 ^ 錨定 — 允許 newPart 內任何位置匹配，SR 前段含「嗯/ah/喔」雜訊也照觸發。
// 三條 OR 分支:英文拆解 / 英文完整 / 中文 — 為了提高觸發率,中文「第三字(堡/伯/博...)」
// 改成可選,因為 zh-TW SR 常常把「Heisenberg」末尾的 -berg 轉不出來,只留「嘿森」「海森」。
// 同時加更多英文前綴(ay/eh/oh)與中段(sam/zhen)變體吸收常見 SR 雜訊。
const WAKE_RE = new RegExp(
  "(" +
    // 英文:拆解前綴 + 中段 + 可選 berg/burg
    "(?:hey|hai|hei|hy|high|hi|ha|ay|eh|oh)[\\s-]?(?:sen|zen|son|sam|zhen)(?:[\\s-]?(?:berg|burg|burgh|bird|burgur))?" +
    "|" +
    // 英文:完整 heisen(berg|burg)
    "heise?n(?:[\\s-]?(?:berg|burg|burgh))?" +
    "|" +
    // 中文同音 — 第三字(堡/伯/博...)改成可選,只要 [首][中] 兩字命中就觸發
    "[海嗨嘿黑哈]\\s*[,，.。!！?？]*\\s*[森生新星心](?:\\s*[,，.。!！?？]*\\s*[堡伯博保包抱勃柏寶][格爵]?)?" +
  ")",
  "i"
);

// 動作 enum — 必須和 server `voice-intent.ts` 同步
type VoiceAction =
  | "email_report"
  | "download_pdf"
  | "restart"
  | "navigate_simulation"
  | "navigate_home"
  | "open_service_faq"
  | "unknown";

type Status = "idle" | "awake" | "processing" | "done" | "error" | "muted";

const BAR_COUNT = 22;
const SILENCE_MS = 1500; // 喚醒後沒新字 1.5 秒就提交（停頓即送出）
const AWAKE_TIMEOUT_MS = 12000; // 喚醒後 12 秒都沒講話自動退場
const DONE_FADEOUT_MS = 3500;

/** 把 SR 的 results 串接成完整 transcript */
function joinTranscript(results: ArrayLike<SpeechRecognitionResult>): string {
  let s = "";
  for (let i = 0; i < results.length; i++) {
    s += results[i][0]?.transcript ?? "";
  }
  return s;
}

/**
 * 全域語音控制 — Hey Heisenberg 喚醒 + 浮窗聲波 + LLM 意圖判讀
 *
 * 行為：
 * - 元件掛載時自動啟動 SR（首次會觸發瀏覽器麥克風授權）
 * - idle 狀態浮窗縮成右下角小膠囊；喚醒後展開、顯示聲波 + 即時 transcript
 * - 喚醒後 1.8s 沒新字 → 把指令送到 /api/voice/intent → LLM 判動作 → 觸發對應 CustomEvent
 * - 動作會由其他元件（ReportCard / ChatInterface）處理；navigate_* 直接由本元件 push router
 */
export function VoiceControl() {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [commandText, setCommandText] = useState(""); // awake 時的即時指令
  const [resultMsg, setResultMsg] = useState<string | null>(null); // done / error 時的提示
  const [bars, setBars] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));
  // SR 是否真的 listening — 由 rec.onstart/onend 切換。沒在 listening 時要在肥皂
  // 上明確顯示「點此啟用麥克風」，避免使用者誤以為 SR 在跑、結果講半天沒反應。
  const [srRunning, setSrRunning] = useState(false);
  const srRunningRef = useRef(false);
  srRunningRef.current = srRunning;

  // refs（避免 closure 過期）
  const statusRef = useRef<Status>("idle");
  statusRef.current = status;
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const wakeConsumedLenRef = useRef(0); // 已 dispatch 過的 transcript 長度，下次只看後段
  const cmdStartIdxRef = useRef(0); // 命令在 full transcript 裡的起點
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFullRef = useRef("");
  const submittingRef = useRef(false);

  // 音訊分析（聲波視覺化）
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  // ===== 浮窗動作 =====

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (awakeTimeoutRef.current) {
      clearTimeout(awakeTimeoutRef.current);
      awakeTimeoutRef.current = null;
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setBars(new Array(BAR_COUNT).fill(0));
  }, []);

  const startAudio = useCallback(async () => {
    if (audioCtxRef.current || rafRef.current !== null) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      // Chrome autoplay 政策：非 user gesture 建立的 AudioContext 會 suspended
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64; // 32 個 bins，取前 BAR_COUNT 個
      analyser.smoothingTimeConstant = 0.7;
      src.connect(analyser);
      analyserRef.current = analyser;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buf);
        const next: number[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          // 取低中頻段（人聲集中）— 跳過最低頻雜訊
          const idx = Math.min(buf.length - 1, i + 1);
          // 0..1，先平方一下讓低音量也有 visible motion
          const v = buf[idx] / 255;
          next.push(Math.min(1, Math.pow(v, 0.7)));
        }
        setBars(next);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      /* 拒絕授權 / 無裝置 — 略過 visualizer，不影響 SR */
    }
  }, []);

  // ===== 流程：喚醒 / 提交 / 完成 =====

  const goIdle = useCallback(() => {
    setStatus("idle");
    setCommandText("");
    clearTimers();
    stopAudio();
    // 把目前 transcript 長度標成「已消化」— 下次只看新增部分找喚醒詞
    wakeConsumedLenRef.current = lastFullRef.current.length;
    submittingRef.current = false;
  }, [clearTimers, stopAudio]);

  const showDone = useCallback(
    (msg: string) => {
      setStatus("done");
      setResultMsg(msg);
      clearTimers();
      stopAudio();
      wakeConsumedLenRef.current = lastFullRef.current.length;
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
      doneTimerRef.current = setTimeout(() => {
        setResultMsg(null);
        setCommandText("");
        setStatus("idle");
        submittingRef.current = false;
      }, DONE_FADEOUT_MS);
    },
    [clearTimers, stopAudio]
  );

  const submitCommand = useCallback(async () => {
    if (submittingRef.current) return;
    const cmd = commandTextSnapshotRef.current.trim();
    if (!cmd) {
      goIdle();
      return;
    }
    submittingRef.current = true;
    setStatus("processing");
    clearTimers();
    stopAudio();

    try {
      const res = await fetch("/api/voice/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: cmd }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        action?: VoiceAction;
        message?: string;
        error?: string;
      };
      if (!res.ok || !body.action) {
        setStatus("error");
        setResultMsg(body.error ?? `判讀失敗 (HTTP ${res.status})`);
        if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
        doneTimerRef.current = setTimeout(() => {
          setStatus("idle");
          setResultMsg(null);
          setCommandText("");
          submittingRef.current = false;
        }, DONE_FADEOUT_MS);
        return;
      }

      const action = body.action;
      const message = body.message ?? "";

      switch (action) {
        case "email_report":
          window.dispatchEvent(new CustomEvent(VOICE_EMAIL_REPORT_EVENT));
          showDone(`✓ ${message || "正在寄送報告"}`);
          break;
        case "download_pdf":
          window.dispatchEvent(new CustomEvent(VOICE_DOWNLOAD_PDF_EVENT));
          showDone(`✓ ${message || "下載報告中"}`);
          break;
        case "restart":
          window.dispatchEvent(new CustomEvent(VOICE_RESTART_EVENT));
          showDone(`✓ ${message || "重新開始"}`);
          break;
        case "navigate_simulation":
          showDone(`✓ ${message || "進入模擬"}`);
          router.push("/simulation");
          break;
        case "navigate_home":
          showDone(`✓ ${message || "回首頁"}`);
          router.push("/");
          break;
        case "open_service_faq":
          showDone(`✓ ${message || "打開服務 QA"}`);
          // ServiceFAQ 目前只 mount 在 /admin。若不在那,先存 flag 再導頁,
          // ServiceFAQ mount 後 useEffect 會讀 flag 自動打開。
          if (
            typeof window !== "undefined" &&
            window.location.pathname !== "/admin"
          ) {
            try {
              sessionStorage.setItem(VOICE_OPEN_FAQ_SESSION_KEY, "1");
            } catch {
              /* sessionStorage 不可用就略過,user 到 admin 後手動點即可 */
            }
            router.push("/admin");
          } else {
            window.dispatchEvent(new CustomEvent(VOICE_OPEN_FAQ_EVENT));
          }
          break;
        default:
          setStatus("error");
          setResultMsg(message || "沒聽清楚，再說一次");
          if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
          doneTimerRef.current = setTimeout(() => {
            setStatus("idle");
            setResultMsg(null);
            setCommandText("");
            submittingRef.current = false;
          }, DONE_FADEOUT_MS);
      }
    } catch (err) {
      setStatus("error");
      setResultMsg(err instanceof Error ? err.message : String(err));
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
      doneTimerRef.current = setTimeout(() => {
        setStatus("idle");
        setResultMsg(null);
        setCommandText("");
        submittingRef.current = false;
      }, DONE_FADEOUT_MS);
    }
  }, [clearTimers, goIdle, router, showDone, stopAudio]);

  // commandText 的 ref snapshot — submitCommand 不重新 mount 但要拿到最新值
  const commandTextSnapshotRef = useRef("");
  commandTextSnapshotRef.current = commandText;

  const armSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      void submitCommand();
    }, SILENCE_MS);
  }, [submitCommand]);

  const enterAwake = useCallback(() => {
    // awake / processing / muted 中就不重複喚醒（避免打斷 in-flight 指令）。
    // 從 done / error / idle 過來都 OK — 重喚的同時，把上一輪所有殘留狀態徹底清掉：
    //   - doneTimer：避免 3.5s 後再清一次把這輪內容也清掉
    //   - silenceTimer / awakeTimeout：上一輪沒釋放的計時器
    //   - resultMsg / commandText：上一輪顯示的指令字 / 提示
    //   - submittingRef：上一輪萬一卡住沒釋放，下面 submitCommand 會直接 bail
    //   - bars：聲波視覺化重置回 0，避免上一輪殘影
    if (
      statusRef.current === "awake" ||
      statusRef.current === "processing" ||
      statusRef.current === "muted"
    ) {
      return;
    }
    if (doneTimerRef.current) {
      clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (awakeTimeoutRef.current) {
      clearTimeout(awakeTimeoutRef.current);
      awakeTimeoutRef.current = null;
    }
    submittingRef.current = false;
    setStatus("awake");
    setCommandText("");
    setResultMsg(null);
    setBars(new Array(BAR_COUNT).fill(0));
    void startAudio();
    awakeTimeoutRef.current = setTimeout(() => {
      // 喚醒後一直沒講話 — 退場
      if (statusRef.current === "awake") {
        goIdle();
      }
    }, AWAKE_TIMEOUT_MS);
    // 不在這裡 arm silence timer — 改成「使用者真的開始講指令時」才啟動，
    // 避免「喚醒後思考一下再講」的情境被 1.5s silence 提前 bail 掉。
  }, [goIdle, startAudio]);

  // ===== SR 啟動 =====

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "zh-TW";

    rec.onresult = (ev) => {
      const full = joinTranscript(ev.results);
      const grew = full.length > lastFullRef.current.length;
      // SR onend 會自動重啟 → results 從 0 開始 → transcript 縮短，wakeConsumedLen
      // 也要相應 reset，否則 slice(consumedLen) 會永遠是空字串、永遠匹配不到喚醒詞。
      if (full.length < lastFullRef.current.length) {
        wakeConsumedLenRef.current = 0;
        cmdStartIdxRef.current = 0;
      }
      lastFullRef.current = full;

      if (process.env.NODE_ENV !== "production" && grew) {
        // 開發時方便驗證 SR 究竟把語音轉成什麼字串，協助校正 wake regex。
        console.debug("[VoiceControl] transcript:", full);
      }

      // idle / done / error 都允許偵測喚醒詞 — 第二次「Hey Heisenberg」要能在
      // 前一輪結果還沒淡出時就直接重新喚醒，否則使用者得等 3.5s 才能下下一個指令。
      const canDetectWake =
        statusRef.current === "idle" ||
        statusRef.current === "done" ||
        statusRef.current === "error";
      if (canDetectWake) {
        // 不再 trim — 直接 lowercase 後讓 regex 在原字串上比對，這樣 m.index 就能
        // 直接對應回 newPart 在 full transcript 裡的偏移，計算 cmd 起點不必再補
        // 回 leading whitespace。
        const newPart = full.slice(wakeConsumedLenRef.current).toLowerCase();
        const m = newPart.match(WAKE_RE);
        if (m && m.index !== undefined) {
          cmdStartIdxRef.current =
            wakeConsumedLenRef.current + m.index + m[0].length;
          enterAwake();
          // 立刻把 cmd 拿一次 — 使用者可能一句話講完「Hey Heisenberg 把報告寄給我」
          const cmd = full.slice(cmdStartIdxRef.current).trim();
          if (cmd) {
            setCommandText(cmd);
            armSilenceTimer();
          }
        }
      } else if (statusRef.current === "awake") {
        const cmd = full.slice(cmdStartIdxRef.current).trim();
        setCommandText(cmd);
        // 只在「指令有內容」且「transcript 真的變長」時 reset 靜音計時器，
        // 避免一喚醒就被計時器倒數掉
        if (grew && cmd.length > 0) armSilenceTimer();
      }
    };

    rec.onstart = () => {
      setSrRunning(true);
    };

    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setStatus("muted");
        setSrRunning(false);
        setResultMsg("麥克風權限被拒，請於瀏覽器設定開啟");
        recognitionRef.current = null;
      }
      // network / no-speech / aborted — 由 onend 重啟
    };

    rec.onend = () => {
      setSrRunning(false);
      // continuous 模式偶爾自動斷 — 只要還活著就重啟
      if (recognitionRef.current === rec && statusRef.current !== "muted") {
        try {
          rec.start();
        } catch {
          /* 重啟失敗，等下一次 user interaction 才能再 start */
        }
      }
    };

    // 先把 ref 接上去，不論這次 start 是否成功 — 之前只在 try 內賦值，導致
    // 第一次 start 拋例外（user gesture 未完成）後 ref 仍是 null，下方的 click
    // 重試 handler 會因 `if (!rec) return` 直接 bail，SR 永遠起不來。
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      /* 多數瀏覽器要求 user gesture — 留 ref 給下方 user gesture handler 重試 */
    }

    return () => {
      recognitionRef.current = null;
      try {
        rec.abort();
      } catch {
        /* 已 end */
      }
      clearTimers();
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
      stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 使用者點 / 按鍵時嘗試啟動（autoplay / permission 政策可能擋住第一次）。
  // 不用 once: true — 萬一第一次 start 仍失敗（例如使用者尚未授權麥克風），
  // 下次互動還能再試。SR 已在跑時 rec.start() 會丟 InvalidStateError，由 catch 吞掉。
  useEffect(() => {
    function tryStart() {
      const rec = recognitionRef.current;
      if (!rec) return;
      try {
        rec.start();
      } catch {
        /* 已在跑 OR 尚未準備好 — 略過 */
      }
    }
    window.addEventListener("pointerdown", tryStart);
    window.addEventListener("keydown", tryStart);
    return () => {
      window.removeEventListener("pointerdown", tryStart);
      window.removeEventListener("keydown", tryStart);
    };
  }, []);

  // 鍵盤捷徑 Cmd/Ctrl + . — 一鍵跳過喚醒詞直接進 awake,當「Hey Heisenberg」沒被
  // SR 認出來時的最後 fallback。選 `.` 是因為瀏覽器 / 多數 web app 都沒占用。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        handlePillClickRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 點擊肥皂的統一進入點：
  //   1) SR 還沒跑（user gesture 沒給、permission 沒授權）→ 嘗試 start，不直接進
  //      awake，因為 SR 沒接通前 onresult 不會 fire、講話也沒人聽。
  //   2) SR 已在跑 → 手動進 awake，當作「跳過喚醒詞」的 fallback（同音字漏網時用）。
  const handlePillClick = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec && !srRunningRef.current) {
      try {
        rec.start();
      } catch {
        /* 已在 transition 中或 InvalidStateError — 等 onstart 自然回正 */
      }
      return;
    }
    if (
      statusRef.current === "idle" ||
      statusRef.current === "done" ||
      statusRef.current === "error"
    ) {
      // 把目前 transcript 全部標成已消化，這樣使用者接下來新講的內容才會被當成
      // 指令，不會把點擊前的雜訊當 cmd。
      cmdStartIdxRef.current = lastFullRef.current.length;
      wakeConsumedLenRef.current = lastFullRef.current.length;
      enterAwake();
    }
  }, [enterAwake]);
  // 給鍵盤捷徑用的 ref — 不必把 handlePillClick 加進 keydown effect deps,
  // 否則每次 render 都會 re-bind window listener。
  const handlePillClickRef = useRef(handlePillClick);
  handlePillClickRef.current = handlePillClick;

  // 不支援 → 不渲染（必須放在所有 Hook 之後，否則違反 Rules of Hooks）
  if (supported === false) return null;

  return (
    <VoicePanel
      status={status}
      commandText={commandText}
      resultMsg={resultMsg}
      bars={bars}
      srRunning={srRunning}
      onPillClick={handlePillClick}
    />
  );
}

// ===== UI =====

function VoicePanel({
  status,
  commandText,
  resultMsg,
  bars,
  srRunning,
  onPillClick,
}: {
  status: Status;
  commandText: string;
  resultMsg: string | null;
  bars: number[];
  srRunning: boolean;
  onPillClick: () => void;
}) {
  const expanded = status !== "idle";
  // 點擊有意義的兩種狀態：(a) idle 但 SR 沒跑 → 點擊啟用麥克風；(b) idle/done/error
  // 但 SR 在跑 → 點擊手動進 awake。muted / awake / processing 都不該再接受點擊。
  const clickable =
    status !== "muted" &&
    status !== "awake" &&
    status !== "processing";

  // dot tooltip — idle 時是唯一的口語提示（按鈕本身已縮成純色點）
  // 順帶帶出 Cmd+. 鍵盤捷徑,讓使用者知道有三種觸發路徑(說 / 按鍵 / 點)
  const dotTooltip =
    status === "idle"
      ? srRunning
        ? "說 Hey Heisenberg · 按 ⌘+. · 或點此手動喚醒"
        : "點此啟用麥克風"
      : status === "awake"
        ? "聆聽指令中…"
        : status === "processing"
          ? "判讀中…"
          : status === "done"
            ? (resultMsg ?? "完成")
            : status === "error"
              ? (resultMsg ?? "失敗")
              : "麥克風未授權";

  return (
    <div
      className="relative inline-flex items-center select-none"
      aria-live="polite"
    >
      {/* 非 idle 時往下彈出 expanded card（header 在頁面上方，所以 dropdown 朝下） */}
      {expanded && (
        <div
          className={[
            "absolute top-full right-0 mt-2 w-72 rounded-2xl border backdrop-blur-md shadow-xl overflow-hidden",
            "transition-all duration-300 z-50",
            status === "awake"
              ? "bg-gradient-to-br from-cyan-500/20 via-slate-900/85 to-violet-500/20 border-cyan-400/50"
              : status === "processing"
                ? "bg-slate-900/85 border-violet-400/50"
                : status === "done"
                  ? "bg-emerald-500/15 border-emerald-400/50"
                  : status === "error"
                    ? "bg-red-500/15 border-red-400/60"
                    : "bg-slate-900/70 border-slate-700/70",
          ].join(" ")}
        >
          <div className="px-3.5 py-2 text-[12px] font-medium text-slate-100">
            {status === "awake" && "聆聽指令中…"}
            {status === "processing" && "判讀中…"}
            {status === "done" && (resultMsg ?? "完成")}
            {status === "error" && (resultMsg ?? "失敗")}
            {status === "muted" && "麥克風未授權"}
          </div>

          {status === "awake" && (
            <div className="px-3.5 pb-3 pt-0">
              <WaveBars bars={bars} />
              <div className="mt-2 min-h-[1.5em] text-[12.5px] text-slate-200 leading-snug break-words">
                {commandText ? (
                  <span>{commandText}</span>
                ) : (
                  <span className="text-slate-500 italic">
                    例：「把報告寄給我」「下載 PDF」「重新開始」
                  </span>
                )}
              </div>
            </div>
          )}

          {status === "processing" && (
            <div className="px-3.5 pb-3 pt-0">
              <div className="text-[12px] text-slate-300 italic break-words">
                {commandText || "…"}
              </div>
              <div className="mt-2 h-1 bg-slate-800 rounded overflow-hidden">
                <div className="h-full w-1/3 bg-gradient-to-r from-cyan-400 to-violet-400 animate-[pulse_1.2s_ease-in-out_infinite]" />
              </div>
            </div>
          )}

          {(status === "done" || status === "error") && commandText && (
            <div className="px-3.5 pb-2.5 pt-0 text-[11.5px] text-slate-400 break-words italic">
              「{commandText}」
            </div>
          )}

          {status === "muted" && (
            <div className="px-3.5 pb-3 pt-0 text-[11px] text-slate-400 leading-snug">
              點擊網址列左側麥克風圖示授權後重新整理頁面。
            </div>
          )}
        </div>
      )}

      {/* 底部恆顯示橫排：[● dot 圓鈕] [↑ 回到入口] */}
      <div className="flex items-center gap-2">
        {/* Hey Heisenberg dot 圓鈕 — 顏色傳達狀態，文字提示走 title (含 Cmd+. 捷徑說明) */}
        <button
          type="button"
          onClick={clickable ? onPillClick : undefined}
          disabled={!clickable}
          title={dotTooltip}
          aria-label={dotTooltip}
          className={[
            "w-8 h-8 rounded-full bg-slate-900/70 border border-slate-700/70 backdrop-blur-md shadow-lg",
            "flex items-center justify-center transition-colors",
            clickable
              ? "cursor-pointer hover:bg-slate-800/80 active:bg-slate-800"
              : "cursor-default",
          ].join(" ")}
        >
          <StatusIndicator status={status} srRunning={srRunning} />
        </button>

        {/* 回到入口 */}
        <button
          type="button"
          onClick={() => {
            // 雙保險：window 先試（頁面級捲動）+ CustomEvent（讓 ChatInterface
            // 內層 scrollRef 也捲頂，因為聊天區是 flex-1 overflow-y-auto 容器）。
            window.scrollTo({ top: 0, behavior: "smooth" });
            window.dispatchEvent(new CustomEvent(APP_SCROLL_TOP_EVENT));
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-slate-900/70 border border-slate-700/70 backdrop-blur-md shadow-lg text-[11px] text-slate-300 hover:bg-slate-800/80 hover:text-slate-100 active:bg-slate-800 transition-colors"
          title="回到頁面最上方"
        >
          <span aria-hidden="true">↑</span>
          <span>回到入口</span>
        </button>
      </div>
    </div>
  );
}

function StatusIndicator({
  status,
  srRunning,
}: {
  status: Status;
  srRunning: boolean;
}) {
  // idle 時依 SR 是否在跑分兩色：未啟用＝橘色（提醒「點此啟用」），listening＝青色脈動。
  const cls =
    status === "idle"
      ? srRunning
        ? "bg-cyan-400"
        : "bg-amber-400"
      : status === "awake"
        ? "bg-cyan-400 animate-pulse"
        : status === "processing"
          ? "bg-violet-400 animate-pulse"
          : status === "done"
            ? "bg-emerald-400"
            : status === "error"
              ? "bg-red-400"
              : "bg-slate-600";
  // listening 才需要呼吸 ping；未啟用就不要 ping，避免假裝「在聽」誤導使用者
  const ping = status === "awake" || (status === "idle" && srRunning);
  return (
    <div className="relative w-2.5 h-2.5">
      <div className={`absolute inset-0 rounded-full ${cls}`} />
      {ping && (
        <div
          className={`absolute inset-0 rounded-full ${cls} opacity-50 animate-ping`}
          style={{ animationDuration: status === "awake" ? "1s" : "2.4s" }}
        />
      )}
    </div>
  );
}

function WaveBars({ bars }: { bars: number[] }) {
  return (
    <div className="flex items-end justify-between gap-[2px] h-12">
      {bars.map((v, i) => {
        // 最低保底 8% 高度，讓 idle 時也有微微跳動感
        const h = Math.max(0.08, v) * 100;
        return (
          <div
            key={i}
            className="flex-1 rounded-full bg-gradient-to-t from-cyan-500 via-cyan-300 to-violet-300 transition-[height] duration-[80ms] ease-out"
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicUser } from "@/components/AuthForm";

type Phase =
  | "boot"
  | "auth"
  | "verifying"
  | "waiting"
  | "flash"
  | "done";
type Field = "username" | "password";
type Line = { text: string; c: string };

const WHITE = "#e8e8e8";
const GREEN = "#3cf07a";
const CYAN = "#00e5ff";
const RED = "#ff5670";

// Boot 動畫 — 完整版含薛丁格方程式 / 對易關係等量子物理意象。
// 配合 18ms / char 的「每聲都聽得見」打字節奏 + 80ms 行間延遲，總時長 ~4-5 秒；
// 想跳過直接按任一鍵立即跳到 auth。
const BOOT_LINES: { t: number; text: string; c: string }[] = [
  { t: 80, text: "> initiating secure shell…", c: WHITE },
  { t: 80, text: "> calibrating observer reference frame", c: WHITE },
  { t: 80, text: "> mounting /lab/sector-07", c: WHITE },
  { t: 100, text: "> solving Schrödinger equation: iℏ∂ψ/∂t = Ĥψ", c: WHITE },
  { t: 80, text: "> evaluating commutator [x̂,p̂] = iℏ", c: WHITE },
  { t: 80, text: "> loading quantum subsystems… OK", c: WHITE },
  { t: 150, text: "", c: WHITE },
  { t: 100, text: "[AUTH] secure channel established", c: GREEN },
];

const VERIFY_LINE = "> verifying credentials… OK";
const STAGE_W = 960;
const STAGE_H = 600;
const FIELD_MAX = 24;

type Props = {
  onEnter: (user: PublicUser) => void;
};

export function LabEntrance({ onEnter }: Props) {
  const [phase, setPhase] = useState<Phase>("boot");
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [scale, setScale] = useState(1);

  const [history, setHistory] = useState<Line[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [field, setField] = useState<Field>("username");
  const [busy, setBusy] = useState(false);
  const [authedUser, setAuthedUser] = useState<PublicUser | null>(null);

  const [verifyChars, setVerifyChars] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 手機/觸控裝置上用的隱藏 input — 由它叫出系統鍵盤。桌機不會 focus 它。
  const mobileInputRef = useRef<HTMLInputElement | null>(null);
  const FAIL_LIMIT = 3;

  // ---------- 打字音效 ----------
  // 用 Web Audio API 合成短促 click（不需外部音檔），每個字打出來就響一聲。
  // 瀏覽器規定 AudioContext 必須由 user gesture 啟用 — 第一次使用者按鍵才開始響，
  // boot 自動跑的 typewriter 在第一次 visit 時可能無聲（但 reload 過後 / 操作過會有）。
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ensureAudio = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      try {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return null;
        audioCtxRef.current = new Ctor();
      } catch {
        return null;
      }
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // 機械式 click：30ms 衰減的白噪音 + low-pass filter，模擬鍵盤 / 終端機鍵聲
  const playKeyClick = useCallback(
    (volume = 0.06) => {
      const ctx = ensureAudio();
      if (!ctx || ctx.state !== "running") return;
      const t = ctx.currentTime;
      const dur = 0.03;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        // 衰減的白噪音
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1800 + Math.random() * 1200; // 1.8-3 kHz 隨機微調避免機械化
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      noise.connect(filter).connect(gain).connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 0.05);
    },
    [ensureAudio]
  );

  // Enter / 交互動作：較粗的 thunk（低頻、稍長）
  const playEnter = useCallback(() => {
    const ctx = ensureAudio();
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  }, [ensureAudio]);

  // 認證失敗的「噠噠」— 兩聲短促 square wave 拒絕音，間隔 ~110ms
  const playError = useCallback(() => {
    const ctx = ensureAudio();
    if (!ctx || ctx.state !== "running") return;
    const t0 = ctx.currentTime;
    const blip = (offset: number) => {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(180, t0 + offset);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t0 + offset);
      gain.gain.linearRampToValueAtTime(0.14, t0 + offset + 0.005);
      gain.gain.setValueAtTime(0.14, t0 + offset + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + offset + 0.09);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.1);
    };
    blip(0);
    blip(0.11);
  }, [ensureAudio]);

  // 認證成功 — 播放 Windows XP 經典開機音效（public/winxp-startup.mp3）
  const startupAudioRef = useRef<HTMLAudioElement | null>(null);
  const playStartup = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!startupAudioRef.current) {
      startupAudioRef.current = new Audio("/winxp-startup.mp3");
      startupAudioRef.current.preload = "auto";
    }
    const audio = startupAudioRef.current;
    audio.currentTime = 0;
    audio.volume = 0.7;
    audio.play().catch(() => {
      /* 自動播放被瀏覽器阻擋就略過 — 進入流程已在 user gesture 之後，通常不會發生 */
    });
  }, []);

  // 三次錯密碼觸發 — 播放 Super Mario 死亡音樂（public/mario-death.mp3）
  const shutdownAudioRef = useRef<HTMLAudioElement | null>(null);
  const playShutdown = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!shutdownAudioRef.current) {
      shutdownAudioRef.current = new Audio("/mario-death.mp3");
      shutdownAudioRef.current.preload = "auto";
    }
    const audio = shutdownAudioRef.current;
    audio.currentTime = 0;
    audio.volume = 0.7;
    audio.play().catch(() => {
      /* 自動播放被瀏覽器阻擋就略過 — 此呼叫已在 user gesture（按 Enter 提交密碼）之後 */
    });
  }, []);

  const reset = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current);
    setPhase("boot");
    setLineIdx(0);
    setCharIdx(0);
    setHistory([]);
    setUsername("");
    setPassword("");
    setField("username");
    setVerifyChars(0);
    setBusy(false);
    setAuthedUser(null);
    setFailCount(0);
    setShaking(false);
  }, []);

  // Responsive scale + viewport tracking — 用 visualViewport 取得「鍵盤跳出後實際可見的範圍」,
  // 這樣手機輸入時 stage 仍然會完整顯示在鍵盤上方,不會被切掉。桌機沒有 visualViewport
  // 變動就退回 innerWidth/innerHeight。
  const [vvHeight, setVvHeight] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const fit = () => {
      const w = vv?.width ?? window.innerWidth;
      const h = vv?.height ?? window.innerHeight;
      setScale(Math.min(w / STAGE_W, h / STAGE_H));
      setVvHeight(h);
    };
    fit();
    window.addEventListener("resize", fit);
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    return () => {
      window.removeEventListener("resize", fit);
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
    };
  }, []);

  // 鎖 body scroll — iOS 在鍵盤跳出時偶爾會把整個頁面往上推捲動,
  // 我們的 stage 是 position:fixed,捲動會讓整體錯位,直接在 mount 期間鎖死。
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // 偵測觸控裝置 — pointer: coarse 涵蓋 iOS / Android 手機與多數平板。
  // 偵測到後才會啟用「focus 隱藏 input → 叫出系統鍵盤」的路徑。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const touch =
      "ontouchstart" in window ||
      (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches);
    setIsTouch(!!touch);
  }, []);

  // 手機鍵盤喚出 — iOS Safari 規定 .focus() 必須在 user gesture 同步呼叫才會跳出鍵盤,
  // 所以我們在 click / SKIP 等 gesture handler 裡呼叫它,而不是只靠 effect。
  const focusMobileInput = useCallback(() => {
    if (!isTouch) return;
    mobileInputRef.current?.focus();
  }, [isTouch]);

  // 「PRESS [ANY KEY] TO ENTER LABORATORY」轉場 — 桌機 keydown 跟手機 tap 共用。
  const advanceFromWaiting = useCallback(() => {
    playEnter();
    playStartup();
    setPhase("flash");
    setTimeout(() => setPhase("done"), 600);
  }, [playEnter, playStartup]);

  // auth 階段 / 切欄位時嘗試 focus(非 gesture 來源,iOS 上可能無聲但桌機可運作);
  // iOS 的退路是使用者 tap 終端機任一處 → onClick 同步 focus → 鍵盤跳出。
  // 離開 auth(verifying / waiting / flash / done)時主動 blur,讓鍵盤收回去。
  useEffect(() => {
    if (!isTouch) return;
    if (phase === "auth") {
      const id = setTimeout(() => mobileInputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
    mobileInputRef.current?.blur();
  }, [isTouch, phase, field]);

  // Boot phase: typewriter-print BOOT_LINES, then enter auth.
  useEffect(() => {
    if (phase !== "boot") return;
    if (lineIdx >= BOOT_LINES.length) {
      setPhase("auth");
      return;
    }
    const line = BOOT_LINES[lineIdx];
    if (charIdx < line.text.length) {
      timeoutRef.current = setTimeout(() => {
        // 空白字元不發聲，否則一行會出現一連串無實質內容的鍵聲
        const ch = line.text[charIdx];
        if (ch && ch.trim().length > 0) playKeyClick(0.045);
        setCharIdx((c) => c + 1);
      }, 18); // 18ms / char — 配合 click 音效節奏，每聲都能聽見
    } else {
      timeoutRef.current = setTimeout(() => {
        setLineIdx((i) => i + 1);
        setCharIdx(0);
      }, line.t);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [phase, lineIdx, charIdx]);

  // Verifying phase: typewriter-print the OK line, then transition to waiting.
  useEffect(() => {
    if (phase !== "verifying") return;
    if (verifyChars < VERIFY_LINE.length) {
      timeoutRef.current = setTimeout(() => {
        const ch = VERIFY_LINE[verifyChars];
        if (ch && ch.trim().length > 0) playKeyClick(0.05);
        setVerifyChars((c) => c + 1);
      }, 22);
    } else {
      timeoutRef.current = setTimeout(() => {
        setHistory((h) => [...h, { text: VERIFY_LINE, c: GREEN }]);
        setVerifyChars(0);
        setPhase("waiting");
      }, 380);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [phase, verifyChars, playKeyClick]);

  const submitField = useCallback(async () => {
    if (busy) return;
    if (field === "username") {
      if (username.trim().length === 0) return;
      setField("password");
      return;
    }
    // field === "password" — POST to /api/auth/login
    if (password.length === 0) return;
    const finalUsername = username.trim();
    const masked = "•".repeat(password.length);
    setBusy(true);
    setHistory((h) => [
      ...h,
      { text: `username: ${finalUsername}`, c: GREEN },
      { text: `password: ${masked}`, c: GREEN },
    ]);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: finalUsername, password }),
      });
      const data = (await res.json()) as { user?: PublicUser; error?: string };
      if (!res.ok || !data.user) {
        handleAuthFailure(data.error ?? "認證失敗");
        return;
      }
      setAuthedUser(data.user);
      setUsername("");
      setPassword("");
      setField("username");
      setVerifyChars(0);
      setBusy(false);
      setFailCount(0); // 成功登入清掉錯誤計數
      setPhase("verifying");
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "network error";
      handleAuthFailure(errMsg);
    }

    // 處理認證失敗：發「噠噠」錯誤音、震動畫面、計次、累積到 FAIL_LIMIT 觸發關機重啟
    function handleAuthFailure(errMsg: string) {
      playError();
      // 觸發畫面震動 — 400ms 後關掉，跟錯誤音長度同步
      setShaking(true);
      if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current);
      shakeTimeoutRef.current = setTimeout(() => setShaking(false), 400);
      const nextFail = failCount + 1;
      setFailCount(nextFail);

      if (nextFail >= FAIL_LIMIT) {
        // 連續錯誤達上限 → 系統 lockdown + 關機音 + 重啟
        setHistory((h) => [
          ...h,
          { text: `> ACCESS DENIED — ${errMsg}`, c: RED },
          {
            text: `> SYSTEM LOCKDOWN — ${FAIL_LIMIT} 次錯誤，系統重啟中…`,
            c: RED,
          },
        ]);
        setUsername("");
        setPassword("");
        setField("username");
        // 不解 busy — 關機動畫期間不接受任何輸入
        playShutdown();
        // 6.5 秒後（瑪莉歐死亡音效約 6.2 秒，留一點尾音）重置回 boot 動畫
        timeoutRef.current = setTimeout(() => reset(), 6500);
        return;
      }

      // 普通錯誤：顯示剩餘嘗試次數提示
      const remaining = FAIL_LIMIT - nextFail;
      setHistory((h) => [
        ...h,
        {
          text: `> ACCESS DENIED — ${errMsg}（剩餘嘗試：${remaining}）`,
          c: RED,
        },
      ]);
      setUsername("");
      setPassword("");
      setField("username");
      setBusy(false);
    }
  }, [busy, field, username, password, failCount, playError, playShutdown, reset]);

  // Keyboard input. Drives boot-skip, auth, the waiting any-key, and the done Enter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 觸控裝置上,字元/Backspace/Enter 都由隱藏 input 自己處理(onChange / onKeyDown),
      // 不要再讓 window 監聽器重複處理,否則會雙倍寫入或誤觸發 submit。
      if (e.target === mobileInputRef.current) return;
      // boot 階段任意鍵立即跳到 auth — 沒耐心看完動畫的使用者可以馬上輸入帳密
      if (
        phase === "boot" &&
        e.key !== "Shift" &&
        e.key !== "Control" &&
        e.key !== "Meta" &&
        e.key !== "Alt" &&
        e.key !== "CapsLock" &&
        e.key.length > 0
      ) {
        e.preventDefault();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setLineIdx(BOOT_LINES.length);
        setCharIdx(0);
        setPhase("auth");
        return;
      }
      // 「PRESS [ANY KEY] TO ENTER LABORATORY」階段 — 接受任何鍵（不限 Enter）。
      // 排除 modifier-only 按鍵（Shift / Ctrl / Meta / Alt 單獨按下時 e.key 是修飾鍵名）
      // 跟長度為 0 的事件（IME composition 中），避免使用者只是按 Shift 就觸發。
      if (
        phase === "waiting" &&
        e.key !== "Shift" &&
        e.key !== "Control" &&
        e.key !== "Meta" &&
        e.key !== "Alt" &&
        e.key !== "CapsLock" &&
        e.key.length > 0
      ) {
        e.preventDefault();
        advanceFromWaiting();
        return;
      }
      if (phase === "done" && e.key === "Enter") {
        e.preventDefault();
        playEnter();
        if (authedUser) onEnter(authedUser);
        return;
      }
      if (phase !== "auth" || busy) return;
      if (e.key === "Enter") {
        e.preventDefault();
        playEnter();
        submitField();
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        playKeyClick(0.05);
        if (field === "username") setUsername((u) => u.slice(0, -1));
        else setPassword((p) => p.slice(0, -1));
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        return;
      }
      // Printable single character only.
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        playKeyClick();
        if (field === "username") {
          setUsername((u) => (u.length >= FIELD_MAX ? u : u + e.key));
        } else {
          setPassword((p) => (p.length >= FIELD_MAX ? p : p + e.key));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, field, busy, submitField, onEnter, authedUser, playKeyClick, playEnter, advanceFromWaiting]);

  const cursor = (color: string) => (
    <span
      style={{
        display: "inline-block",
        width: "0.55em",
        height: "1em",
        background: color,
        marginLeft: 2,
        verticalAlign: "-0.15em",
        animation: "lab-cursor-blink 1s step-end infinite",
      }}
    />
  );

  // Boot lines being typed (still typing) or fully shown (after boot phase).
  const bootEnd = phase === "boot" ? lineIdx + 1 : BOOT_LINES.length;
  const bootRendered = BOOT_LINES.slice(0, bootEnd).map((line, i) => {
    const isCurrent = phase === "boot" && i === lineIdx;
    const text = isCurrent ? line.text.slice(0, charIdx) : line.text;
    return (
      <div key={`boot-${i}`} style={{ color: line.c, minHeight: "1.5em" }}>
        {text}
        {isCurrent && cursor(line.c)}
      </div>
    );
  });

  return (
    <div
      onClick={() => {
        // 觸控裝置上,點任一處(boot / auth)都同步 focus 隱藏 input,
        // 滿足 iOS 對 user gesture 的要求,讓系統鍵盤跳出來。
        if (phase === "auth" || phase === "boot") focusMobileInput();
        // waiting 階段(「PRESS [ANY KEY] TO ENTER LABORATORY」)— 手機沒實體鍵盤,
        // 用 tap 觸發轉場;桌機也能 tap,但通常用 keydown 進入。
        else if (phase === "waiting") advanceFromWaiting();
      }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        // 用 visualViewport 高度當容器高度 — 鍵盤跳出時 vvHeight 會縮短,
        // stage 自動置中於「鍵盤上方的可視範圍」,不會被切掉。
        height: vvHeight ?? "100%",
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        zIndex: 50,
      }}
    >
      {/* 手機鍵盤喚出用的隱藏 input — 透明、只能被程式 focus,不擋畫面點擊。
          桌機從不 focus 它,所以行為跟以前一樣;手機 focus 後會跳出系統鍵盤。 */}
      <input
        ref={mobileInputRef}
        // 統一 type=text:切換欄位時 iOS 不會因 type 變更而關掉鍵盤。
        // 安全性無虞 — input 全透明、不顯示在畫面上,真正的遮罩仍由終端機顯示層處理。
        type="text"
        value={field === "username" ? username : password}
        onChange={(e) => {
          if (busy) return;
          const next = e.currentTarget.value.slice(0, FIELD_MAX);
          const prev = field === "username" ? username : password;
          if (next.length !== prev.length) playKeyClick(0.05);
          if (field === "username") setUsername(next);
          else setPassword(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            playEnter();
            submitField();
          }
        }}
        inputMode="text"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        maxLength={FIELD_MAX}
        aria-label={field === "username" ? "username" : "password"}
        tabIndex={-1}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          opacity: 0,
          border: 0,
          padding: 0,
          margin: 0,
          background: "transparent",
          color: "transparent",
          caretColor: "transparent",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          width: STAGE_W,
          height: STAGE_H,
          background: "#000",
          position: "relative",
          overflow: "hidden",
          fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
          fontSize: 14,
          userSelect: "none",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {/* CRT scanlines */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(255,255,255,0.02), rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px)",
            zIndex: 5,
          }}
        />
        {/* CRT vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)",
            zIndex: 6,
          }}
        />

        {/* Welcome reveal (phase = done) */}
        {phase === "done" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at center, #0a1828 0%, #02060d 70%, #000 100%)",
              color: CYAN,
              opacity: 0,
              animation: "lab-fade-bg 0.6s forwards",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "repeating-linear-gradient(0deg, rgba(0,229,255,0.04) 0px, rgba(0,229,255,0.04) 1px, transparent 1px, transparent 3px)",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: 0,
                width: "200%",
                height: "60%",
                transform:
                  "translateX(-50%) perspective(400px) rotateX(60deg)",
                transformOrigin: "center bottom",
                backgroundImage: `linear-gradient(${CYAN} 1px, transparent 1px), linear-gradient(90deg, ${CYAN} 1px, transparent 1px)`,
                backgroundSize: "60px 60px",
                opacity: 0.15,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div
                style={{
                  fontSize: 28,
                  letterSpacing: "0.3em",
                  opacity: 0,
                  animation: "lab-fade-up 0.6s 0.4s forwards",
                }}
              >
                WELCOME, OBSERVER.
              </div>
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: "0.4em",
                  opacity: 0,
                  animation: "lab-fade-up 0.6s 0.8s forwards",
                }}
              >
                LAB-07 // 海森堡的算盤 · 人類行為觀測站
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 24,
                  opacity: 0,
                  animation: "lab-fade-up 0.6s 1.2s forwards",
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (authedUser) onEnter(authedUser);
                  }}
                  disabled={!authedUser}
                  style={{
                    background: CYAN,
                    border: `1px solid ${CYAN}`,
                    color: "#02060d",
                    fontFamily: "inherit",
                    fontSize: 11,
                    letterSpacing: "0.3em",
                    padding: "10px 22px",
                    cursor: authedUser ? "pointer" : "not-allowed",
                    opacity: authedUser ? 1 : 0.4,
                    fontWeight: 600,
                  }}
                >
                  ENTER LAB →
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    reset();
                  }}
                  style={{
                    background: "transparent",
                    border: `1px solid ${CYAN}`,
                    color: CYAN,
                    fontFamily: "inherit",
                    fontSize: 11,
                    letterSpacing: "0.3em",
                    padding: "10px 20px",
                    cursor: "pointer",
                  }}
                >
                  ↻ REPLAY
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Terminal text */}
        {phase !== "done" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              padding: "40px 56px",
              color: "#9aa",
              opacity: phase === "flash" ? 0 : 1,
              transition: "opacity 0.3s",
              overflow: "hidden",
              animation: shaking ? "lab-shake 0.4s linear" : undefined,
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.2em",
                color: "#566",
                marginBottom: 24,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>LAB-OS v4.1.7  •  TTY-01</span>
              <span>SESSION #A82F-99C1</span>
            </div>

            {bootRendered}

            {history.map((line, i) => (
              <div
                key={`hist-${i}`}
                style={{ color: line.c, minHeight: "1.5em" }}
              >
                {line.text}
              </div>
            ))}

            {phase === "auth" && failCount < FAIL_LIMIT && (
              <>
                <div style={{ color: GREEN, minHeight: "1.5em" }}>
                  username: {field === "username" ? username : username || ""}
                  {field === "username" && cursor(GREEN)}
                </div>
                {field === "password" && (
                  <div style={{ color: GREEN, minHeight: "1.5em" }}>
                    password: {"•".repeat(password.length)}
                    {cursor(GREEN)}
                  </div>
                )}
                <div
                  style={{
                    marginTop: 14,
                    fontSize: 11,
                    letterSpacing: "0.2em",
                    color: "#566",
                  }}
                >
                  HINT — accounts: udo / esun · ENTER to submit
                </div>
              </>
            )}

            {phase === "verifying" && (
              <div style={{ color: GREEN, minHeight: "1.5em" }}>
                {VERIFY_LINE.slice(0, verifyChars)}
                {cursor(GREEN)}
              </div>
            )}

            {phase === "waiting" && (
              <div style={{ marginTop: 18, color: "#0fc" }}>
                <div style={{ marginBottom: 8 }}>* IDENTITY CONFIRMED *</div>
                <div
                  style={{
                    animation: "lab-prompt-pulse 1.4s ease-in-out infinite",
                  }}
                >
                  {isTouch
                    ? "TAP ANYWHERE TO ENTER LABORATORY"
                    : "PRESS [ANY KEY] TO ENTER LABORATORY"}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Flash transition */}
        {phase === "flash" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: CYAN,
              animation: "lab-flash-out 0.6s ease-out forwards",
              zIndex: 10,
            }}
          />
        )}

        {/* Skip — fast-forwards the boot typewriter to the auth prompt */}
        {phase === "boot" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              setLineIdx(BOOT_LINES.length);
              setCharIdx(0);
              setPhase("auth");
              // 同 user gesture 內呼叫 focus, iOS 才會跳出鍵盤
              focusMobileInput();
            }}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              zIndex: 20,
              background: "transparent",
              border: "1px solid #9aa4",
              color: "#9aac",
              fontFamily: "inherit",
              fontSize: 10,
              letterSpacing: "0.2em",
              padding: "6px 12px",
              cursor: "pointer",
              borderRadius: 2,
            }}
          >
            SKIP →
          </button>
        )}

        <style jsx>{`
          @keyframes lab-cursor-blink {
            0%,
            50% {
              opacity: 1;
            }
            51%,
            100% {
              opacity: 0;
            }
          }
          @keyframes lab-prompt-pulse {
            0%,
            100% {
              opacity: 1;
            }
            50% {
              opacity: 0.4;
            }
          }
          @keyframes lab-flash-out {
            0% {
              opacity: 0;
            }
            20% {
              opacity: 1;
            }
            100% {
              opacity: 0;
            }
          }
          @keyframes lab-shake {
            0%,
            100% {
              transform: translate(0, 0);
            }
            10% {
              transform: translate(-4px, 2px);
            }
            20% {
              transform: translate(4px, -2px);
            }
            30% {
              transform: translate(-3px, -2px);
            }
            40% {
              transform: translate(3px, 2px);
            }
            50% {
              transform: translate(-2px, 1px);
            }
            60% {
              transform: translate(2px, -1px);
            }
            70% {
              transform: translate(-2px, -1px);
            }
            80% {
              transform: translate(2px, 1px);
            }
            90% {
              transform: translate(-1px, 0);
            }
          }
          @keyframes lab-fade-up {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes lab-fade-bg {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

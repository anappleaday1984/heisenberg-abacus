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

const BOOT_LINES: { t: number; text: string; c: string }[] = [
  { t: 180, text: "> initiating secure shell…", c: WHITE },
  { t: 220, text: "> calibrating observer reference frame", c: WHITE },
  { t: 220, text: "> mounting /lab/sector-07", c: WHITE },
  { t: 280, text: "> solving Schrödinger equation: iℏ∂ψ/∂t = Ĥψ", c: WHITE },
  { t: 220, text: "> evaluating commutator [x̂,p̂] = iℏ", c: WHITE },
  { t: 220, text: "> loading quantum subsystems… OK", c: WHITE },
  { t: 400, text: "", c: WHITE },
  { t: 200, text: "[AUTH] secure channel established", c: GREEN },
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
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
  }, []);

  // Responsive scale: keep 960×600 stage, fit to viewport.
  useEffect(() => {
    const fit = () => {
      const sx = window.innerWidth / STAGE_W;
      const sy = window.innerHeight / STAGE_H;
      setScale(Math.min(sx, sy));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Boot phase: typewriter-print BOOT_LINES, then enter auth.
  useEffect(() => {
    if (phase !== "boot") return;
    if (lineIdx >= BOOT_LINES.length) {
      setPhase("auth");
      return;
    }
    const line = BOOT_LINES[lineIdx];
    if (charIdx < line.text.length) {
      timeoutRef.current = setTimeout(() => setCharIdx((c) => c + 1), 18);
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
      timeoutRef.current = setTimeout(() => setVerifyChars((c) => c + 1), 22);
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
  }, [phase, verifyChars]);

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
        const errMsg = data.error ?? "認證失敗";
        setHistory((h) => [
          ...h,
          { text: `> ACCESS DENIED — ${errMsg}`, c: RED },
        ]);
        setUsername("");
        setPassword("");
        setField("username");
        setBusy(false);
        return;
      }
      setAuthedUser(data.user);
      setUsername("");
      setPassword("");
      setField("username");
      setVerifyChars(0);
      setBusy(false);
      setPhase("verifying");
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "network error";
      setHistory((h) => [
        ...h,
        { text: `> ACCESS DENIED — ${errMsg}`, c: RED },
      ]);
      setUsername("");
      setPassword("");
      setField("username");
      setBusy(false);
    }
  }, [busy, field, username, password]);

  // Keyboard input. Drives auth, the waiting Enter, and the done Enter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "waiting" && e.key === "Enter") {
        e.preventDefault();
        setPhase("flash");
        setTimeout(() => setPhase("done"), 600);
        return;
      }
      if (phase === "done" && e.key === "Enter") {
        e.preventDefault();
        if (authedUser) onEnter(authedUser);
        return;
      }
      if (phase !== "auth" || busy) return;
      if (e.key === "Enter") {
        e.preventDefault();
        submitField();
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
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
        if (field === "username") {
          setUsername((u) => (u.length >= FIELD_MAX ? u : u + e.key));
        } else {
          setPassword((p) => (p.length >= FIELD_MAX ? p : p + e.key));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, field, busy, submitField, onEnter, authedUser]);

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
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        zIndex: 50,
      }}
    >
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

            {phase === "auth" && (
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
                  PRESS [ENTER] TO ENTER LABORATORY
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

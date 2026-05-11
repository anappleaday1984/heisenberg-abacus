"use client";

import { useEffect, useState } from "react";
import { LabEntrance } from "@/components/LabEntrance";
import type { PublicUser } from "@/components/AuthForm";
import { usePersonaSession } from "@/lib/persona-session-context";

type Props = {
  children: React.ReactNode;
};

// 上次「進入實驗室」的時間戳記 — 比較這個跟 session 提供的時間戳判斷要不要重置
const ENTRANCE_KEY = "wth.persona-session.v3";

export function EntranceGate({ children }: Props) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [checking, setChecking] = useState(true);
  const session = usePersonaSession();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user: PublicUser | null }) => {
        setUser(d.user ?? null);
      })
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  // 通過入口（剛剛 LabEntrance.onEnter）時，清空 session 的訊息 / 受訪者顯影 /
  // QA / 報告 — 讓使用者每次重新進入都從乾淨起點開始，不被上次的紀錄干擾。
  // 同時清掉 localStorage，避免 reload 時又被重新 hydrate 出來。
  function handleEnter(u: PublicUser) {
    try {
      localStorage.removeItem(ENTRANCE_KEY);
    } catch {
      /* localStorage 不可用就略過 */
    }
    session.reset();
    setUser(u);
  }

  if (checking) {
    return <div className="h-screen bg-black" />;
  }

  if (!user) {
    return <LabEntrance onEnter={handleEnter} />;
  }

  // VoiceControl 由各頁面在 header 內 inline 渲染（對齊登入按鈕左側），不再全域掛載。
  return <>{children}</>;
}

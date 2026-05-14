"use client";

import { useState } from "react";

export type PublicUser = {
  account: string;
  name: string;
  role: "admin" | "member";
};

type Props = {
  onSuccess: (user: PublicUser) => void;
  /** Layout variant — modal-style (compact) or page-style (centered card) */
  variant?: "modal" | "page";
  showCancel?: boolean;
  onCancel?: () => void;
};

// Demo accounts — quick-fill。udo 為主 demo 帳號,點擊直接帶密碼 + 自動登入,讓
// demo 現場一鍵到位;esun 仍維持「只填帳號」需手動輸入密碼。demoPassword 寫死在
// client 上純粹是本機 demo 的妥協 — 真實部署請拿掉。
const DEMO_ACCOUNTS = [
  { account: "udo", name: "管理員", color: "amber" as const, demoPassword: "0825" },
  { account: "esun", name: "成員", color: "slate" as const },
];

const QUICK_BTN_COLOR: Record<"amber" | "slate", string> = {
  amber: "text-amber-300 hover:text-amber-200 border-amber-500/40 hover:border-amber-500",
  slate: "text-slate-300 hover:text-slate-100 border-slate-600 hover:border-slate-400",
};

export function AuthForm({
  onSuccess,
  variant = "modal",
  showCancel = false,
  onCancel,
}: Props) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function performLogin(acct: string, pwd: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: acct, password: pwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "登入失敗");
      onSuccess(data.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function fillAccount(acct: string, demoPwd?: string) {
    setAccount(acct);
    if (demoPwd) {
      // demo 帳號(udo)— 直接帶密碼並自動送出,讓 demo 一鍵到位
      setPassword(demoPwd);
      void performLogin(acct, demoPwd);
    }
    // 沒 demoPwd 的(esun)只填帳號,密碼讓使用者手動輸入
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await performLogin(account, password);
  }

  const containerClass =
    variant === "page"
      ? "w-full max-w-sm space-y-4 bg-slate-900/80 border border-slate-700 rounded-2xl p-7 shadow-2xl"
      : "w-full max-w-sm space-y-4";

  return (
    <form onSubmit={submit} className={containerClass}>
      {variant === "page" && (
        <div>
          <h1 className="text-xl font-semibold text-slate-100">
            海森堡的算盤
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            請先登入後使用 multi-agent 市場調查服務
          </p>
        </div>
      )}
      {variant === "modal" && (
        <h2 className="text-lg font-semibold text-slate-100">登入</h2>
      )}

      <div>
        <label className="block text-xs text-slate-400 mb-1">帳號</label>
        <input
          type="text"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          autoFocus
          autoComplete="username"
          disabled={busy}
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">密碼</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={busy}
            className="w-full bg-slate-800 border border-slate-700 rounded pl-3 pr-10 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
            title={showPassword ? "隱藏密碼" : "顯示密碼"}
            className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-1 text-slate-400 hover:text-slate-200"
          >
            {showPassword ? "🙈" : "👁"}
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-400">{error}</div>}

      <div className="bg-slate-800/40 border border-slate-700 rounded p-2 text-xs text-slate-400 space-y-1.5">
        <div className="text-slate-300 font-medium">
          常用帳號(udo demo 一鍵登入,esun 點擊只填帳號)
        </div>
        <div className="flex gap-2 flex-wrap">
          {DEMO_ACCOUNTS.map((d) => (
            <button
              key={d.account}
              type="button"
              onClick={() => fillAccount(d.account, d.demoPassword)}
              disabled={busy}
              className={`border rounded px-2 py-0.5 disabled:opacity-50 ${QUICK_BTN_COLOR[d.color]}`}
            >
              {d.account} / {d.name}
              {d.demoPassword && (
                <span className="ml-1 text-[10px] text-amber-300/70">⚡ 一鍵</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        {showCancel && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-slate-400 hover:text-slate-200 px-3 py-1.5"
          >
            取消
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !account || !password}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium px-4 py-1.5 rounded"
        >
          {busy ? "登入中..." : "登入"}
        </button>
      </div>
    </form>
  );
}

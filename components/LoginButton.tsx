"use client";

import { useEffect, useState } from "react";
import { AuthForm, type PublicUser } from "./AuthForm";

const ROLE_BADGE: Record<PublicUser["role"], string> = {
  admin: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  member: "bg-slate-600/30 text-slate-300 border-slate-500/40",
};

export function LoginButton() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  if (user) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/60 border border-slate-700">
          <code className="text-xs text-slate-500">{user.account}</code>
          <span className="text-slate-500">·</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border ${ROLE_BADGE[user.role]}`}
          >
            {user.name}
          </span>
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded px-2 py-1.5"
        >
          登出
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-slate-300 hover:text-slate-100 bg-slate-800/40 border border-slate-700 hover:border-slate-500 rounded-md px-3 py-1.5"
      >
        🔑 登入
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl"
          >
            <AuthForm
              onSuccess={(u) => {
                setUser(u);
                setOpen(false);
              }}
              variant="modal"
              showCancel
              onCancel={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

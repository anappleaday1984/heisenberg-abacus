"use client";

import { useEffect, useState } from "react";
import { AuthForm, type PublicUser } from "./AuthForm";

type Props = {
  children: React.ReactNode;
};

export function AuthGate({ children }: Props) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-slate-500">
        檢查登入狀態...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <AuthForm onSuccess={setUser} variant="page" />
      </div>
    );
  }

  return <>{children}</>;
}

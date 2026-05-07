"use client";

import { useEffect, useState } from "react";
import { LabEntrance } from "@/components/LabEntrance";
import type { PublicUser } from "@/components/AuthForm";

type Props = {
  children: React.ReactNode;
};

export function EntranceGate({ children }: Props) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user: PublicUser | null }) => {
        setUser(d.user ?? null);
      })
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return <div className="h-screen bg-black" />;
  }

  if (!user) {
    return <LabEntrance onEnter={(u) => setUser(u)} />;
  }

  return <>{children}</>;
}

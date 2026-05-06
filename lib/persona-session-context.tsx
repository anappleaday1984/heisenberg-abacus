"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Persona } from "./agents/personas-data";
import type { QAEntry } from "./agents/types";
import type { DisplayMessage } from "@/components/MessageBubble";

type SessionState = {
  personas: Persona[] | null;
  qaEntries: QAEntry[] | null;
  questions: string[] | null;
  productContext: string | null;
  messages: DisplayMessage[];
  showInsights: boolean;
};

type Ctx = SessionState & {
  setPersonas: (personas: Persona[], productContext?: string) => void;
  setQA: (questions: string[], entries: QAEntry[]) => void;
  setMessages: (
    updater: DisplayMessage[] | ((prev: DisplayMessage[]) => DisplayMessage[])
  ) => void;
  setShowInsights: (v: boolean) => void;
  reset: () => void;
};

const PersonaSessionContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "wth.persona-session.v2";

const EMPTY: SessionState = {
  personas: null,
  qaEntries: null,
  questions: null,
  productContext: null,
  messages: [],
  showInsights: false,
};

export function PersonaSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(EMPTY);

  // Hydrate from localStorage once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SessionState>;
      if (
        parsed &&
        (parsed.personas ||
          parsed.qaEntries ||
          (parsed.messages && parsed.messages.length > 0))
      ) {
        // 清掉殘留的 streaming 狀態 — 避免 reload 後永遠閃 cursor
        const cleanedMessages = (parsed.messages ?? []).map((m) =>
          m.streaming ? { ...m, streaming: false } : m
        );
        setState({
          ...EMPTY,
          ...parsed,
          messages: cleanedMessages,
          showInsights: parsed.showInsights ?? false,
        });
      }
    } catch {
      /* ignore — corrupt storage */
    }
  }, []);

  // Persist on change
  useEffect(() => {
    try {
      const hasContent =
        state.personas || state.qaEntries || state.messages.length > 0;
      if (hasContent) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* ignore — quota or disabled */
    }
  }, [state]);

  const setPersonas = useCallback(
    (personas: Persona[], productContext?: string) => {
      setState((s) => ({
        ...s,
        personas,
        productContext: productContext ?? s.productContext,
      }));
    },
    []
  );

  const setQA = useCallback((questions: string[], entries: QAEntry[]) => {
    setState((s) => ({
      ...s,
      questions,
      qaEntries: entries,
      personas: s.personas ?? entries.map((e) => e.persona),
    }));
  }, []);

  const setMessages = useCallback(
    (
      updater:
        | DisplayMessage[]
        | ((prev: DisplayMessage[]) => DisplayMessage[])
    ) => {
      setState((s) => ({
        ...s,
        messages:
          typeof updater === "function" ? updater(s.messages) : updater,
      }));
    },
    []
  );

  const setShowInsights = useCallback((v: boolean) => {
    setState((s) => ({ ...s, showInsights: v }));
  }, []);

  const reset = useCallback(() => setState(EMPTY), []);

  const value = useMemo<Ctx>(
    () => ({
      ...state,
      setPersonas,
      setQA,
      setMessages,
      setShowInsights,
      reset,
    }),
    [state, setPersonas, setQA, setMessages, setShowInsights, reset]
  );

  return (
    <PersonaSessionContext.Provider value={value}>
      {children}
    </PersonaSessionContext.Provider>
  );
}

export function usePersonaSession(): Ctx {
  const v = useContext(PersonaSessionContext);
  if (!v) {
    throw new Error(
      "usePersonaSession 必須在 <PersonaSessionProvider> 內使用"
    );
  }
  return v;
}

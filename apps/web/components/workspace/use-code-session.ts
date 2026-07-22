"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExecutionResult, ExecutionTest } from "@/lib/code-execution";

// The Code screen unmounts when the user navigates to another workspace view and
// remounts on return, which previously wiped all local state (code, topic,
// answer, attempt history). Persisting the session to localStorage and restoring
// it on mount makes the session survive navigation, refresh, tab-switch, and
// errors — a selection or submission never discards the learner's work.

export type CodeAttempt = {
  id: string;
  at: number;
  mode: string;
  language: string;
  topic: string;
  prompt: string;
  code: string;
  answer: string;
};

export type RuntimeAttempt = {
  id: string;
  at: number;
  source: string;
  stdin: string;
  result: ExecutionResult;
};

export type CodeSession = {
  goalId: string;
  topic: string;
  language: string;
  mode: string;
  provider: string;
  prompt: string;
  code: string;
  stdin: string;
  tests: ExecutionTest[];
  runtimeResult?: ExecutionResult;
  runtimeHistory: RuntimeAttempt[];
  answer: string;
  hintsRevealed: number;
  attempts: CodeAttempt[];
  updatedAt: number;
};

const VERSION = "v1";
const storageKey = (userId: string) => `continuum.code-session.${VERSION}.${userId}`;

export function makeDefaultSession(defaults: Partial<CodeSession>): CodeSession {
  return {
    goalId: "",
    topic: "",
    language: "Python",
    mode: "explain",
    provider: "auto",
    prompt: "",
    code: "",
    stdin: "",
    tests: [],
    runtimeHistory: [],
    answer: "",
    hintsRevealed: 0,
    attempts: [],
    updatedAt: Date.now(),
    ...defaults,
  };
}

/** Merge a persisted session (JSON string) over the current one. Pure + tested. */
export function mergeSavedSession(current: CodeSession, savedJson: string | null): CodeSession {
  if (!savedJson) return current;
  try {
    const parsed = JSON.parse(savedJson) as Partial<CodeSession>;
    return {
      ...current,
      ...parsed,
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : current.attempts,
      tests: Array.isArray(parsed.tests) ? parsed.tests : current.tests,
      runtimeHistory: Array.isArray(parsed.runtimeHistory) ? parsed.runtimeHistory : current.runtimeHistory,
    };
  } catch {
    return current; // corrupt draft → keep defaults
  }
}

export function useCodeSession(userId: string, defaults: Partial<CodeSession>) {
  // First paint uses defaults (keeps SSR/CSR markup identical); the persisted
  // session is loaded in an effect after mount, then `restored` gates writes so
  // we never clobber a saved session with defaults before it loads.
  const [session, setSession] = useState<CodeSession>(() => makeDefaultSession(defaults));
  const [restored, setRestored] = useState(false);
  const key = storageKey(userId);
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  useEffect(() => {
    try {
      setSession((current) => mergeSavedSession(current, window.localStorage.getItem(key)));
    } catch {
      /* ignore a corrupt draft; fall back to defaults */
    }
    setRestored(true);
    // Only re-run if the account changes.
  }, [key]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(session));
    } catch {
      /* storage full / unavailable — keep working in memory */
    }
  }, [session, restored, key]);

  const update = useCallback((patch: Partial<CodeSession> | ((current: CodeSession) => Partial<CodeSession>)) => {
    setSession((current) => ({ ...current, ...(typeof patch === "function" ? patch(current) : patch), updatedAt: Date.now() }));
  }, []);

  const pushAttempt = useCallback((attempt: Omit<CodeAttempt, "id" | "at">) => {
    setSession((current) => ({
      ...current,
      attempts: [{ ...attempt, id: `attempt_${Date.now()}`, at: Date.now() }, ...current.attempts].slice(0, 20),
      updatedAt: Date.now(),
    }));
  }, []);

  const pushRuntimeAttempt = useCallback((attempt: Omit<RuntimeAttempt, "id" | "at">) => {
    setSession((current) => ({
      ...current,
      runtimeResult: attempt.result,
      runtimeHistory: [{ ...attempt, id: `run_${Date.now()}`, at: Date.now() }, ...current.runtimeHistory].slice(0, 20),
      updatedAt: Date.now(),
    }));
  }, []);

  const reset = useCallback(() => {
    const fresh = makeDefaultSession(defaultsRef.current);
    setSession(fresh);
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [key]);

  return { session, update, pushAttempt, pushRuntimeAttempt, reset, restored };
}

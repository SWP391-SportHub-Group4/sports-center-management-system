"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "./apiClient";

/** Recheck open content after backgrounding and periodically; hide cached content on revoked access. */
export function useAccessGuard(
  scope: string,
  probe: (signal: AbortSignal) => Promise<unknown>,
) {
  const latest = useRef(probe);
  const [revokedScope, setRevokedScope] = useState<string | null>(null);
  useEffect(() => {
    latest.current = probe;
  }, [probe]);
  useEffect(() => {
    let active: AbortController | undefined;
    const check = async () => {
      if (document.visibilityState === "hidden" || active) return;
      const controller = new AbortController();
      active = controller;
      try {
        await latest.current(controller.signal);
      } catch (error) {
        if (
          !controller.signal.aborted &&
          error instanceof ApiError &&
          [401, 403, 404].includes(error.status)
        )
          setRevokedScope(scope);
      } finally {
        active = undefined;
      }
    };
    const timer = window.setInterval(() => void check(), 30_000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [scope]);
  return revokedScope === scope;
}

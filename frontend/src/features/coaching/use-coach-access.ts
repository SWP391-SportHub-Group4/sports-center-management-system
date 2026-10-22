"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/apiClient";

/** Remove an open student/session view after its assignment is revoked. */
export function useCoachAccess(
  probe: (signal: AbortSignal) => Promise<unknown>,
  scope: string,
) {
  const latest = useRef(probe);
  const [revokedScope, setRevokedScope] = useState<string | null>(null);
  useEffect(() => {
    latest.current = probe;
  });
  useEffect(() => {
    let controller: AbortController | undefined;
    const check = () => {
      if (document.visibilityState === "hidden") return;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      void latest.current(signal).catch((error: unknown) => {
        if (
          !signal.aborted &&
          error instanceof ApiError &&
          [403, 404].includes(error.status)
        )
          setRevokedScope(scope);
      });
    };
    const timer = window.setInterval(check, 30_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [scope]);
  return revokedScope === scope;
}

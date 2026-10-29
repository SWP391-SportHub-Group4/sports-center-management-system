"use client";

import { useEffect } from "react";
import { useApi } from "@/lib/useApi";
import { useKeepPrevious } from "@/lib/keep-previous";
import { rentalApi } from "./api";

export function useRentalPolicy() {
  const policy = useApi((signal) => rentalApi.policy(signal), []);
  const reload = policy.reload;
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") reload();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload]);
  return useKeepPrevious(policy);
}

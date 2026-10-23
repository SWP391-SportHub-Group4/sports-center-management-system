"use client";

import { useEffect, useState } from "react";
import { addDaysIso, todayIso } from "@/lib/format";
import type { MemberPackageDto } from "@/lib/types";

/** Refresh ownership at Vietnam midnight and when a 24-hour pass expires. */
export function useMembershipDay(
  reload: () => void,
  owned: readonly MemberPackageDto[] = [],
) {
  const [clock, setClock] = useState(() => ({
    today: todayIso(),
    now: Date.now(),
  }));
  const nextExpiry = owned
    .map((row) => (row.expiresAtUtc ? Date.parse(row.expiresAtUtc) : NaN))
    .filter((expiry) => Number.isFinite(expiry) && expiry > clock.now)
    .sort((a, b) => a - b)[0];

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      setClock({ today: todayIso(), now: Date.now() });
      reload();
    };
    const scheduleRefresh = () => {
      const midnight = new Date(
        `${addDaysIso(todayIso(), 1)}T00:00:00+07:00`,
      ).getTime();
      const deadline = Math.min(
        midnight,
        nextExpiry && nextExpiry > Date.now() ? nextExpiry : Infinity,
      );
      timer = setTimeout(
        () => {
          refresh();
          scheduleRefresh();
        },
        Math.max(1, deadline - Date.now() + 25),
      );
    };
    const resume = () => {
      if (document.visibilityState === "hidden") return;
      clearTimeout(timer);
      refresh();
      scheduleRefresh();
    };
    scheduleRefresh();
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [reload, nextExpiry]);

  return clock;
}

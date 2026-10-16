"use client";

import { useEffect, useState } from "react";
import { addDaysIso, todayIso } from "@/lib/format";

/** Expire day passes at Vietnam midnight, including after returning from the payment gateway. */
export function useMembershipDay(reload: () => void) {
  const [today, setToday] = useState(todayIso);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      setToday(todayIso());
      reload();
    };
    const scheduleMidnight = () => {
      const midnight = new Date(
        `${addDaysIso(todayIso(), 1)}T00:00:00+07:00`,
      ).getTime();
      timer = setTimeout(
        () => {
          refresh();
          scheduleMidnight();
        },
        Math.max(1, midnight - Date.now() + 25),
      );
    };
    const resume = () => {
      if (document.visibilityState === "hidden") return;
      clearTimeout(timer);
      refresh();
      scheduleMidnight();
    };
    scheduleMidnight();
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [reload]);

  return today;
}

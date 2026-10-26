"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import type { Paged } from "@/lib/types";

type Check = {
  code: string;
  attempt: number;
  status: "available" | "taken" | "error";
};

/** Check all matching manager rows, across sports and statuses, excluding this class. */
export function useClassCodeValidation(
  value: string,
  classId?: number,
  attempt = 0,
) {
  const code = value.trim().toUpperCase();
  const validFormat = code.length >= 2 && code.length <= 50;
  const [check, setCheck] = useState<Check | null>(null);

  useEffect(() => {
    if (!validFormat) return;
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(async () => {
      try {
        let page = 1;
        let loaded = 0;
        while (active) {
          const result = await api.get<
            Paged<{ classId: number; code: string }>
          >("/api/manager/classes", {
            query: { keyword: code, page, pageSize: 100 },
            signal: controller.signal,
          });
          if (!active) return;
          if (
            result.items.some(
              (item) =>
                item.classId !== classId &&
                item.code.trim().toUpperCase() === code,
            )
          ) {
            setCheck({ code, attempt, status: "taken" });
            return;
          }
          loaded += result.items.length;
          if (loaded >= result.totalCount) {
            setCheck({ code, attempt, status: "available" });
            return;
          }
          if (!result.items.length) throw new Error("Incomplete code check");
          page += 1;
        }
      } catch {
        if (active) setCheck({ code, attempt, status: "error" });
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [code, classId, validFormat, attempt]);

  return !validFormat
    ? "invalid"
    : check?.code === code && check.attempt === attempt
      ? check.status
      : "checking";
}

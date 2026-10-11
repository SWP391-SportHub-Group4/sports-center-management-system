"use client";

import { useSyncExternalStore } from "react";

/** Theo dõi một media query; phía máy chủ luôn trả false để HTML đầu tiên giống nhau. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (listener) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

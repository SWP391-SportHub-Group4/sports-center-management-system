"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { SPORT_CATALOG_CHANGED } from "@/lib/sport-catalog-events";
import type { GallerySport } from "./sport-gallery";

export function useSportGallery() {
  const [sports, setSports] = useState<GallerySport[] | null>(null);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const reload = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    api
      .get<GallerySport[]>("/api/public/sports-gallery", {
        anonymous: true,
        signal: controller.signal,
      })
      .then((rows) => {
        if (!controller.signal.aborted) {
          setSports(rows);
          setError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
  }, []);
  useEffect(() => {
    reload();
    const visible = () => {
      if (document.visibilityState === "visible") reload();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === SPORT_CATALOG_CHANGED) reload();
    };
    window.addEventListener(SPORT_CATALOG_CHANGED, reload);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    // Other devices/users are picked up without replacing the Media draft or moving focus.
    const timer = window.setInterval(visible, 15_000);
    return () => {
      request.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener(SPORT_CATALOG_CHANGED, reload);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [reload]);
  return { sports, error, reload };
}

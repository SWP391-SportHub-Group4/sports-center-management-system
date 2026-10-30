"use client";

import { useEffect, useRef, useState } from "react";
import { incidentApi, type IncidentDraftReference } from "./incident-api";
import { vietnamUtc } from "@/lib/vietnam-time";

type Marker = { references: IncidentDraftReference[]; confirming: boolean };

// Retire old holds and preserve only a pending-confirmation flag. New reviews save no draft or hold references.
export function useIncidentDraftCleanup(userId?: string) {
  const key = userId ? `sporthub.incident-cleanup.v1:${userId}` : "";
  const marker = useRef<Marker>({ references: [], confirming: false });
  const [readyFor, setReadyFor] = useState("");
  const [error, setError] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const persist = () => {
    if (marker.current.references.length || marker.current.confirming)
      sessionStorage.setItem(key, JSON.stringify(marker.current));
    else sessionStorage.removeItem(key);
  };

  useEffect(() => {
    if (!key) return;
    let disposed = false;
    setReadyFor("");
    setError(false);
    void (async () => {
      try {
        let saved: Marker = { references: [], confirming: false };
        try {
          saved = JSON.parse(sessionStorage.getItem(key) ?? "null") ?? saved;
        } catch {
          /* Ignore malformed markers. */
        }
        if (!Array.isArray(saved.references)) saved.references = [];
        marker.current = saved;
        const legacyKey = `sporthub.incident-draft.v1:${userId}`;
        try {
          const legacy = JSON.parse(localStorage.getItem(legacyKey) ?? "null");
          if (legacy) {
            marker.current.confirming ||= legacy.uncertain === true;
            if (legacy.scope && legacy.start && legacy.end)
              marker.current.references.push({
                fenceId: legacy.fenceId || undefined,
                scope: legacy.scope,
                roomId: legacy.scope === "ROOM" ? Number(legacy.roomId) : null,
                startAtUtc: vietnamUtc(legacy.start),
                endAtUtc: vietnamUtc(legacy.end),
              });
          }
        } catch {
          /* A corrupt old draft is removed below. */
        }
        const oldKeys = Object.keys(localStorage).filter((k) =>
          k.startsWith("sporthub.incident-draft."),
        );
        for (const oldKey of oldKeys) localStorage.removeItem(oldKey);
        persist();
        setUncertain(marker.current.confirming === true);
        if (marker.current.references.length) {
          const result = await incidentApi.discardDrafts(
            marker.current.references,
          );
          if (disposed) return;
          if (result.some((r) => r.notUndone.length > 0))
            throw new Error("Some schedule changes could not be undone.");
          marker.current.references = [];
          persist();
        }
        if (!disposed) setReadyFor(key);
      } catch {
        if (!disposed) setError(true);
      }
    })();
    return () => {
      disposed = true;
    };
    // Cleanup is per signed-in account and retries; form edits never trigger a discard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retryVersion]);

  useEffect(() => {
    const discard = () => {
      if (marker.current.references.length)
        void incidentApi
          .discardDrafts(marker.current.references, true)
          .catch(() => {
            /* Retried on the next page load. */
          });
    };
    window.addEventListener("pagehide", discard);
    return () => window.removeEventListener("pagehide", discard);
  }, [key]);

  return {
    ready: !!key && readyFor === key,
    error,
    uncertain,
    retry: () => setRetryVersion((v) => v + 1),
    markConfirming(value: boolean) {
      marker.current.confirming = value;
      try {
        persist();
      } catch {
        setError(true);
      }
    },
  };
}

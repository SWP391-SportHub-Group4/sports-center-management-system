"use client";
import { useEffect, useState, type RefObject } from "react";
import { api } from "./apiClient";
import { useAuth } from "./auth";

const changedEvent = "sporthub:manager-requests-changed";
export function notifyManagerRequestsChanged() {
  window.dispatchEvent(new Event(changedEvent));
}

export function useManagerRequestUnread() {
  const { user } = useAuth();
  const [unread, setUnread] = useState<{
    userId: string;
    count: number;
  } | null>(null);
  const managerId = user?.role === "CenterManager" ? user.userId : null;
  useEffect(() => {
    if (!managerId) return;
    const controller = new AbortController();
    let generation = 0;
    const refresh = () => {
      const request = ++generation;
      void api
        .get<{ unread: number }>("/api/manager/requests/summary", {
          signal: controller.signal,
        })
        .then((result) => {
          if (
            !controller.signal.aborted &&
            request === generation &&
            Number.isInteger(result.unread) &&
            result.unread >= 0
          )
            setUnread({ userId: managerId, count: result.unread });
        })
        .catch(() => {
          /* Keep the last confirmed count; a failed refresh is not zero unread. */
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener(changedEvent, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener(changedEvent, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [managerId]);
  return unread?.userId === managerId ? unread.count : 0;
}

/** Detail panes are read when opened; full refund cards are read only when they enter the viewport. */
export function useManagerRequestRead(
  type: "coach" | "refunds" | "support",
  id: string,
  enabled = true,
  visibleRef?: RefObject<Element | null>,
) {
  const { user } = useAuth();
  const managerId = user?.role === "CenterManager" ? user.userId : null;
  useEffect(() => {
    if (!managerId || !enabled || !id) return;
    const controller = new AbortController();
    let sent = false;
    const mark = () => {
      if (sent) return;
      sent = true;
      void api
        .post(`/api/manager/requests/${type}/${id}/read`, undefined, {
          signal: controller.signal,
        })
        .then(() => {
          if (!controller.signal.aborted) notifyManagerRequestsChanged();
        })
        .catch(() => {
          sent = false;
        });
    };
    const observer = visibleRef?.current
      ? new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) mark();
          },
          { threshold: 0.1 },
        )
      : null;
    if (observer && visibleRef?.current) observer.observe(visibleRef.current);
    else mark();
    return () => {
      controller.abort();
      observer?.disconnect();
    };
  }, [managerId, type, id, enabled, visibleRef]);
}

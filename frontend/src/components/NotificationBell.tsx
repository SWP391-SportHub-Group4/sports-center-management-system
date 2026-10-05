"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { IconBell } from "@/components/icons";
import { memberNotificationHref } from "@/features/member/notifications-api";

interface NotificationDto {
  notificationId: string;
  sourceEventType: string;
  sourceEntityId: string | null;
  message: string;
  status: string;
  sentAt: string | null;
}

/**
 * Hộp thư trong ứng dụng (BR-33). MVP chỉ có kênh InApp hoạt động thật (SSOT §1.3), nên
 * "nhận thông báo" chính là đọc bảng notifications qua API.
 *
 * Poll 60 giây thay vì SignalR: thông báo ở đây là nhắc hạn gói và báo đổi lịch — chậm một
 * phút không ảnh hưởng gì, và một kết nối realtime chỉ để làm việc đó là chi phí thừa.
 */
export function NotificationBell() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [actionError, setActionError] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unread = useApi(
    (signal) =>
      api.get<{ count: number }>("/api/notifications/unread-count", { signal }),
    [],
  );

  // Chỉ tải danh sách khi người dùng mở panel — không kéo về mỗi phút thứ không ai nhìn.
  const items = useApi(
    (signal) =>
      open
        ? api.get<NotificationDto[]>("/api/notifications", { signal })
        : Promise.resolve(null),
    [open],
  );

  useEffect(() => {
    const timer = window.setInterval(() => unread.reload(), 60_000);
    const refresh = () => {
      unread.reload();
      items.reload();
    };
    window.addEventListener("sporthub:notifications-read", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("sporthub:notifications-read", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bấm ra ngoài thì đóng panel.
  useEffect(() => {
    if (!open) return;

    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("mousedown", handler);

    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = async () => {
    try {
      await api.post("/api/notifications/read-all");
      unread.reload();
      items.reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const count = unread.data?.count ?? 0;
  const list = items.data ?? [];

  return (
    <div className="bell" ref={containerRef}>
      <button
        type="button"
        className="btn btn--ghost btn--sm bell__btn"
        onClick={() => setOpen((current) => !current)}
        aria-label={`${t.refactor.notifications} (${count})`}
      >
        <IconBell size={18} />
        <span className="bell__label">{t.refactor.notifications}</span>
        {count > 0 && (
          <span className="bell__count">{count > 99 ? "99+" : count}</span>
        )}
      </button>

      {open && (
        <div className="bell__panel">
          <div className="row spread" style={{ padding: "10px 13px" }}>
            <strong className="small">{t.refactor.notifications}</strong>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void markAllRead()}
              disabled={count === 0}
            >
              {t.refactor.readAll}
            </button>
          </div>

          {(items.error || actionError) && (
            <p role="alert">{items.error?.message || actionError}</p>
          )}
          {items.loading && list.length === 0 ? (
            <p className="state">{t.refactor.loading}</p>
          ) : list.length === 0 ? (
            <p className="state">{t.refactor.empty}</p>
          ) : (
            list.map((item) => (
              <div
                key={item.notificationId}
                className={`bell__item ${item.status !== "READ" ? "bell__item--unread" : ""}`}
              >
                {item.message}
                {user?.role === "Member" && memberNotificationHref(item) && (
                  <Link href={memberNotificationHref(item)!}>
                    {t.refactor.details}
                  </Link>
                )}
                <time>{formatDateTime(item.sentAt)}</time>
              </div>
            ))
          )}
          <Link href="/notifications" onClick={() => setOpen(false)}>
            {t.memberPages.viewAll}
          </Link>
        </div>
      )}
    </div>
  );
}

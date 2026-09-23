"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";

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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unread = useApi(
    (signal) => api.get<{ count: number }>("/api/notifications/unread-count", { signal }),
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

    return () => window.clearInterval(timer);
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
    await api.post("/api/notifications/read-all");
    unread.reload();
    items.reload();
  };

  const count = unread.data?.count ?? 0;
  const list = items.data ?? [];

  return (
    <div className="bell" ref={containerRef}>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Thông báo${count > 0 ? ` (${count} chưa đọc)` : ""}`}
      >
        Thông báo
        {count > 0 && <span className="bell__count">{count > 99 ? "99+" : count}</span>}
      </button>

      {open && (
        <div className="bell__panel">
          <div className="row spread" style={{ padding: "10px 13px" }}>
            <strong className="small">Thông báo</strong>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void markAllRead()}
              disabled={count === 0}
            >
              Đánh dấu đã đọc
            </button>
          </div>

          {items.loading && list.length === 0 ? (
            <p className="state">Đang tải…</p>
          ) : list.length === 0 ? (
            <p className="state">Chưa có thông báo nào.</p>
          ) : (
            list.map((item) => (
              <div
                key={item.notificationId}
                className={`bell__item ${item.status !== "Read" ? "bell__item--unread" : ""}`}
              >
                {item.message}
                <time>{formatDateTime(item.sentAt)}</time>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

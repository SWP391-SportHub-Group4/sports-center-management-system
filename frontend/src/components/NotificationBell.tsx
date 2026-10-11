"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { IconBell } from "@/components/icons";
import {
  memberNotificationHref,
  notificationActionLabel,
  notificationsApi,
  type NotificationDto,
} from "@/features/member/notifications-api";

import styles from "./NotificationBell.module.css";

/**
 * Hộp thư trong ứng dụng (BR-33). MVP chỉ có kênh InApp hoạt động thật (SSOT §1.3), nên
 * "nhận thông báo" chính là đọc bảng notifications qua API.
 *
 * Poll 60 giây thay vì SignalR: thông báo ở đây là nhắc hạn gói và báo đổi lịch — chậm một
 * phút không ảnh hưởng gì, và một kết nối realtime chỉ để làm việc đó là chi phí thừa.
 */
export function NotificationBell() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const { user } = useAuth();
  const [actionError, setActionError] = useState("");
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
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

    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("mousedown", handler);

    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const markAllRead = async () => {
    setBusy(true);
    setActionError("");
    try {
      await api.post("/api/notifications/read-all");
      unread.reload();
      items.reload();
      window.dispatchEvent(new Event("sporthub:notifications-read"));
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const count = unread.data?.count ?? 0;
  const list = items.data ?? [];

  async function openItem(item: NotificationDto, href: string) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      if (item.status !== "READ")
        await notificationsApi.read(item.notificationId);
      window.dispatchEvent(new Event("sporthub:notifications-read"));
      setOpen(false);
      router.push(href);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bell" ref={containerRef}>
      <button
        type="button"
        className="btn btn--ghost btn--sm bell__btn"
        ref={triggerRef}
        aria-expanded={open}
        aria-controls={panelId}
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
        <section
          className={styles.panel}
          id={panelId}
          aria-label={t.refactor.notifications}
        >
          <div className={styles.header}>
            <strong className="small">{t.refactor.notifications}</strong>
            <button
              type="button"
              className={styles.readAll}
              onClick={() => void markAllRead()}
              disabled={count === 0 || busy}
            >
              {t.refactor.readAll}
            </button>
          </div>

          {(items.error || actionError) && (
            <p role="alert">{items.error?.message || actionError}</p>
          )}
          <div className={styles.list}>
            {items.loading && list.length === 0 ? (
              <p className="state">{t.refactor.loading}</p>
            ) : list.length === 0 ? (
              <p className="state">{t.refactor.empty}</p>
            ) : (
              list.map((item) => {
                const href =
                  user?.role === "Member"
                    ? memberNotificationHref(item)
                    : item.actionUrl?.startsWith(
                          user?.role === "CenterManager"
                            ? "/manager/"
                            : user?.role === "Coach"
                              ? "/coach/"
                              : "/__no_role__/",
                        )
                      ? item.actionUrl
                      : null;
                const content = (
                  <>
                    <span className={styles.dot} aria-hidden="true" />
                    <span>
                      <span className={styles.message}>{item.message}</span>
                      <time>{formatDateTime(item.sentAt)}</time>
                      {href && (
                        <span className={styles.action}>
                          {notificationActionLabel(item, language)} →
                        </span>
                      )}
                    </span>
                  </>
                );
                return href ? (
                  <Link
                    key={item.notificationId}
                    className={styles.item}
                    data-unread={item.status !== "READ"}
                    href={href}
                    onNavigate={(event) => {
                      event.preventDefault();
                      void openItem(item, href);
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={item.notificationId}
                    className={styles.item}
                    data-unread={item.status !== "READ"}
                  >
                    {content}
                  </div>
                );
              })
            )}
          </div>
          <Link
            className={styles.footer}
            href="/notifications"
            onClick={() => setOpen(false)}
          >
            {t.memberPages.viewAll}
          </Link>
        </section>
      )}
    </div>
  );
}

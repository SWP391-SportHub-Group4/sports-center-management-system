"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { IconBell } from "@/components/icons";
import {
  notificationInboxHref,
  notificationPresentation,
  type NotificationDto,
} from "@/features/member/notifications-api";

import styles from "./NotificationBell.module.css";

/**
 * In-app preview shared by all roles. Every message opens the inbox reader;
 * the reader persists read receipts and offers any related business action separately.
 *
 * Poll 60 giây thay vì SignalR: thông báo ở đây là nhắc hạn gói và báo đổi lịch — chậm một
 * phút không ảnh hưởng gì, và một kết nối realtime chỉ để làm việc đó là chi phí thừa.
 */
export function NotificationBell() {
  const { t } = useLanguage();
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
  const list = (items.data ?? []).slice(0, 6);

  return (
    <div className="bell" ref={containerRef}>
      <button
        type="button"
        className={`${styles.trigger} bell__btn`}
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
              list.map((item) => (
                <Link
                  key={item.notificationId}
                  className={styles.item}
                  data-unread={item.status !== "READ"}
                  href={notificationInboxHref(item)}
                  onClick={() => setOpen(false)}
                >
                  <span className={styles.dot} aria-hidden="true" />
                  <span className={styles.preview}>
                    <strong className={styles.subject}>
                      {notificationPresentation(item).title}
                    </strong>
                    <span className={styles.message}>{item.message}</span>
                    <time>{formatDateTime(item.sentAt)}</time>
                    <span className={styles.action}>Read message →</span>
                  </span>
                </Link>
              ))
            )}
          </div>
          <Link
            className={styles.footer}
            href="/notifications"
            onClick={() => setOpen(false)}
          >
            Open inbox
          </Link>
        </section>
      )}
    </div>
  );
}

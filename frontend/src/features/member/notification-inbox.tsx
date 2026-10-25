"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Inbox,
  Mail,
  MailOpen,
  Megaphone,
  MessageSquare,
  ReceiptText,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/apiClient";
import { choiceQuery, pageQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { formatDateTime } from "@/lib/format";
import { Tabs, Button, buttonClass } from "@/components/primitives";
import {
  notificationActionHref,
  notificationActionLabel,
  notificationInboxHref,
  notificationPresentation,
  notificationsApi,
  type NotificationDto,
} from "./notifications-api";
import styles from "./notifications.module.css";

const categoryIcons = {
  schedule: CalendarDays,
  class: GraduationCap,
  payment: ReceiptText,
  training: Activity,
  notice: Megaphone,
  support: MessageSquare,
};
function announceRead() {
  window.dispatchEvent(
    new CustomEvent("sporthub:notifications-read", {
      detail: { source: "inbox" },
    }),
  );
}
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "We couldn't update this message. Please try again.";
}

export function NotificationInbox() {
  const { user } = useAuth();
  const { values, setValues } = useUrlQuery(
    { tab: "all", message: "", search: "", page: "1" },
    {
      tab: choiceQuery(["all", "unread"], "all"),
      page: pageQuery,
      message: (value) => (value.length <= 80 ? value : ""),
      search: (value) => value.trim().slice(0, 150),
    },
  );
  const unreadOnly = values.tab === "unread";
  const page = Number(values.page);
  const searchId = useId();
  const readerTitleId = useId();
  const [searchDraft, setSearchDraft] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set());
  const [preview, setPreview] = useState<NotificationDto | null>(null);
  const [readError, setReadError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [allReadError, setAllReadError] = useState("");
  const [markingAll, setMarkingAll] = useState(false);
  const pendingReads = useRef(new Set<string>());
  const readerRef = useRef<HTMLElement>(null);

  const state = useApi(
    (signal) =>
      notificationsApi.inbox(
        { unreadOnly, search: values.search, page },
        signal,
      ),
    [unreadOnly, values.search, page, user?.userId],
  );
  const unread = useApi(
    (signal) =>
      api.get<{ count: number }>("/api/notifications/unread-count", { signal }),
    [user?.userId],
  );
  const rows = state.data?.items ?? [];
  const listedSelection = rows.find(
    (item) => item.notificationId === values.message,
  );
  const cachedSelection =
    preview?.notificationId === values.message ? preview : null;
  const needsDetail =
    !!values.message && !listedSelection && !cachedSelection && !state.loading;
  const detail = useApi(
    (signal) =>
      needsDetail
        ? notificationsApi.get(values.message, signal)
        : Promise.resolve(null),
    [values.message, needsDetail, user?.userId],
  );
  const fetchedSelection =
    detail.data?.notificationId === values.message ? detail.data : null;
  const selected = listedSelection ?? cachedSelection ?? fetchedSelection;
  const isRead = useCallback(
    (item: NotificationDto) =>
      item.status === "READ" || readIds.has(item.notificationId),
    [readIds],
  );
  const selectedIsRead = !!selected && isRead(selected);
  const visibleRows = rows.filter((item) => !unreadOnly || !isRead(item));
  const removedUnread = unreadOnly
    ? rows.filter(
        (item) => item.status !== "READ" && readIds.has(item.notificationId),
      ).length
    : 0;
  const total = Math.max(0, (state.data?.totalCount ?? 0) - removedUnread);
  const pages = Math.max(1, Math.ceil(total / (state.data?.pageSize ?? 25)));

  const markRead = useCallback(async (id: string) => {
    if (pendingReads.current.has(id)) return;
    pendingReads.current.add(id);
    try {
      await notificationsApi.read(id);
      setReadError((current) => (current?.id === id ? null : current));
      setReadIds((current) => new Set([...current, id]));
      announceRead();
    } catch (error) {
      setReadError({ id, message: errorMessage(error) });
    } finally {
      pendingReads.current.delete(id);
    }
  }, []);

  // The message opens even when its read receipt fails; retries never gate reading.
  useEffect(() => {
    const id = selected?.notificationId;
    if (!id || selectedIsRead) return;
    // Persist the receipt after the reader is painted, not for a selection superseded before display.
    const frame = window.requestAnimationFrame(() => void markRead(id));
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.notificationId, selectedIsRead, markRead]);
  useEffect(() => {
    if (selected?.notificationId)
      readerRef.current?.focus({ preventScroll: true });
  }, [selected?.notificationId]);

  const refreshList = state.reload;
  const refreshUnread = unread.reload;
  useEffect(() => {
    const changed = (event: Event) => {
      refreshUnread();
      if (
        (event as CustomEvent<{ source?: string }>).detail?.source !== "inbox"
      )
        refreshList();
    };
    const timer = window.setInterval(refreshUnread, 60_000);
    window.addEventListener("sporthub:notifications-read", changed);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("sporthub:notifications-read", changed);
    };
  }, [refreshList, refreshUnread]);

  function rememberSelection() {
    if (selected)
      setPreview({
        ...selected,
        status: selectedIsRead ? "READ" : selected.status,
      });
  }
  function select(item: NotificationDto) {
    setPreview(item);
    setReadError(null);
    setValues({ message: item.notificationId });
  }
  function changeFilter(tab: string) {
    rememberSelection();
    setValues({ tab, page: "1" });
  }
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    rememberSelection();
    setValues({ search: (searchDraft ?? values.search).trim(), page: "1" });
    setSearchDraft(null);
  }
  async function markAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    setAllReadError("");
    try {
      await notificationsApi.readAll();
      setReadIds(
        (current) =>
          new Set([
            ...current,
            ...rows.map((item) => item.notificationId),
            ...(selected ? [selected.notificationId] : []),
          ]),
      );
      if (selected) setPreview({ ...selected, status: "READ" });
      setReadError(null);
      setValues({ page: "1" });
      state.reload();
      announceRead();
    } catch (error) {
      setAllReadError(errorMessage(error));
    } finally {
      setMarkingAll(false);
    }
  }

  const selectedIndex = selected
    ? visibleRows.findIndex(
        (item) => item.notificationId === selected.notificationId,
      )
    : -1;
  const previous = selectedIndex > 0 ? visibleRows[selectedIndex - 1] : null;
  const next =
    selectedIndex >= 0 ? visibleRows[selectedIndex + 1] : visibleRows[0];
  const presentation = selected ? notificationPresentation(selected) : null;
  const DetailIcon = presentation
    ? categoryIcons[presentation.category]
    : MailOpen;
  const destination = selected
    ? notificationActionHref(selected, user?.role)
    : null;
  const isSupportNotice =
    user?.role === "CenterManager" &&
    selected &&
    ["SUPPORT_SLA_REMINDER", "SUPPORT_PAYOUT_NOT_RECEIVED"].includes(
      selected.sourceEventType,
    );
  const hasUnread =
    (unread.data?.count ?? 0) > 0 || rows.some((item) => !isRead(item));

  return (
    <section className={styles.inbox} aria-label="Notification inbox">
      <header className={styles.toolbar}>
        <p>Schedule changes, class updates and messages from your center.</p>
        <div className={styles.toolbarActions}>
          <Button
            variant="secondary"
            icon={<CheckCheck size={17} />}
            loading={markingAll}
            disabled={!hasUnread}
            onClick={() => void markAllRead()}
          >
            Mark all as read
          </Button>
        </div>
      </header>
      {allReadError && (
        <p className={styles.error} role="alert">
          {allReadError}
        </p>
      )}
      <div className={styles.workspace} data-reading={!!values.message}>
        <section className={styles.index} aria-label="Messages">
          <div className={styles.listHeading}>
            <div>
              <Inbox size={20} aria-hidden="true" />
              <h2>Messages</h2>
            </div>
            {state.data && <span className={styles.count}>{total}</span>}
          </div>
          <form
            className={styles.search}
            onSubmit={search}
            role="search"
            aria-label="Search notifications"
          >
            <label className="sr-only" htmlFor={searchId}>
              Search messages
            </label>
            <input
              id={searchId}
              type="search"
              maxLength={150}
              placeholder="Search messages…"
              value={searchDraft ?? values.search}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
            <button type="submit" aria-label="Search messages">
              <Search size={18} />
            </button>
          </form>
          <div className={styles.tabs}>
            <Tabs
              ariaLabel="Message status"
              value={values.tab}
              onChange={changeFilter}
              tabs={[
                { id: "all", label: "All" },
                { id: "unread", label: "Unread" },
              ]}
            >
              {values.search && (
                <div className={styles.searchSummary}>
                  <span>Results for “{values.search}”</span>
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      rememberSelection();
                      setSearchDraft(null);
                      setValues({ search: "", page: "1" });
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
              {state.loading ? (
                <div
                  className={styles.loading}
                  role="status"
                  aria-label="Loading messages"
                >
                  <span className="sr-only">Loading messages…</span>
                  {[0, 1, 2, 3].map((index) => (
                    <div className={styles.skeleton} key={index}>
                      <span />
                      <span />
                      <span />
                    </div>
                  ))}
                </div>
              ) : state.error ? (
                <div className={styles.listState} role="alert">
                  <Mail size={28} />
                  <h3>Messages couldn’t load</h3>
                  <p>{state.error.message}</p>
                  <Button variant="secondary" onClick={state.reload}>
                    Try again
                  </Button>
                </div>
              ) : visibleRows.length === 0 ? (
                <div className={styles.listState}>
                  <CheckCheck size={32} aria-hidden="true" />
                  <h3>
                    {values.search
                      ? "No matching messages"
                      : unreadOnly
                        ? total > 0
                          ? "No unread messages on this page"
                          : "You’re all caught up"
                        : "Your inbox is ready"}
                  </h3>
                  <p>
                    {values.search
                      ? "Try a different word or clear your search."
                      : unreadOnly
                        ? "No unread messages on this page."
                        : "New updates will appear here when there’s something to share."}
                  </p>
                  {unreadOnly && total > 0 && (
                    <Button variant="secondary" onClick={state.reload}>
                      Load unread messages
                    </Button>
                  )}
                </div>
              ) : (
                <ul className={styles.messageList} aria-label="Notifications">
                  {visibleRows.map((item) => {
                    const info = notificationPresentation(item);
                    const RowIcon = categoryIcons[info.category];
                    const read = isRead(item);
                    return (
                      <li key={item.notificationId}>
                        <Link
                          className={styles.message}
                          data-selected={values.message === item.notificationId}
                          data-unread={!read}
                          href={notificationInboxHref(item)}
                          aria-current={
                            values.message === item.notificationId
                              ? "true"
                              : undefined
                          }
                          onNavigate={(event) => {
                            event.preventDefault();
                            select(item);
                          }}
                        >
                          <span
                            className={styles.messageIcon}
                            data-category={info.category}
                          >
                            <RowIcon size={18} aria-hidden="true" />
                          </span>
                          <span className={styles.messageText}>
                            <span className={styles.messageMeta}>
                              <span>{info.label}</span>
                              <span
                                className={styles.readDot}
                                aria-label={read ? "Read" : "Unread"}
                              />
                            </span>
                            <span className={styles.subject}>{info.title}</span>
                            <span className={styles.excerpt}>
                              {item.message}
                            </span>
                            <time dateTime={item.sentAt ?? undefined}>
                              {item.sentAt
                                ? formatDateTime(item.sentAt)
                                : "Just added"}
                            </time>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              <nav className={styles.pagination} aria-label="Message pages">
                <span>
                  Page {page} of {pages}
                </span>
                <div>
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={page <= 1 || state.loading}
                    onClick={() => {
                      rememberSelection();
                      setValues({ page: String(page - 1) });
                    }}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={page >= pages || state.loading}
                    onClick={() => {
                      rememberSelection();
                      setValues({ page: String(page + 1) });
                    }}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </nav>
            </Tabs>
          </div>
        </section>
        <section className={styles.readingPane} aria-label="Message reader">
          {values.message ? (
            <>
              <div className={styles.readerToolbar}>
                <button
                  type="button"
                  className={styles.back}
                  onClick={() => setValues({ message: "" })}
                >
                  <ArrowLeft size={17} />
                  Back to inbox
                </button>
                <div className={styles.readerControls}>
                  <button
                    type="button"
                    aria-label="Previous message"
                    disabled={!previous}
                    onClick={() => previous && select(previous)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next message"
                    disabled={!next}
                    onClick={() => next && select(next)}
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="Close message"
                    onClick={() => setValues({ message: "" })}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              {selected && presentation ? (
                <article
                  ref={readerRef}
                  className={styles.article}
                  key={selected.notificationId}
                  tabIndex={-1}
                  aria-labelledby={readerTitleId}
                >
                  <div className={styles.readerMeta}>
                    <span
                      className={styles.category}
                      data-category={presentation.category}
                    >
                      <DetailIcon size={16} aria-hidden="true" />
                      {presentation.label}
                    </span>
                    <span className={styles.readStatus}>
                      {selectedIsRead ? (
                        <>
                          <Check size={14} />
                          Read
                        </>
                      ) : (
                        <>
                          <Mail size={14} />
                          Unread
                        </>
                      )}
                    </span>
                  </div>
                  <h2 id={readerTitleId}>{presentation.title}</h2>
                  <div className={styles.sender}>
                    <span className={styles.senderIcon}>
                      <MailOpen size={19} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>
                        {selected.senderName?.trim() || "SportHub"}
                      </strong>
                      <time dateTime={selected.sentAt ?? undefined}>
                        {selected.sentAt
                          ? formatDateTime(selected.sentAt)
                          : "In-app message"}
                      </time>
                    </div>
                  </div>
                  {readError?.id === selected.notificationId &&
                    !selectedIsRead && (
                      <div className={styles.error} role="alert">
                        <p>
                          Your message is open, but couldn’t be marked as read.{" "}
                          {readError.message}
                        </p>
                        <button
                          type="button"
                          onClick={() => void markRead(selected.notificationId)}
                        >
                          Retry marking as read
                        </button>
                      </div>
                    )}
                  <div className={styles.body}>{selected.message}</div>
                  <footer className={styles.readerFooter}>
                    {destination ? (
                      <>
                        <p>
                          {isSupportNotice
                            ? destination.includes("request=")
                              ? "Review the request’s current status, latest reply and activity."
                              : "This older notice has no request link. Open the queue to find the request."
                            : "Continue to the related information."}
                        </p>
                        <Link
                          className={buttonClass({ variant: "primary" })}
                          href={destination}
                        >
                          {notificationActionLabel(selected, "en")}
                          <ArrowRight size={17} aria-hidden="true" />
                        </Link>
                      </>
                    ) : (
                      <p>
                        This message is for your information. No further action
                        is linked.
                      </p>
                    )}
                  </footer>
                </article>
              ) : detail.error ? (
                <div className={styles.readerEmpty} role="alert">
                  <Mail size={36} />
                  <h2>This message couldn’t open</h2>
                  <p>{detail.error.message}</p>
                  <Button variant="secondary" onClick={detail.reload}>
                    Try again
                  </Button>
                </div>
              ) : (
                <div className={styles.readerEmpty} role="status">
                  <MailOpen size={36} aria-hidden="true" />
                  <p>Opening your message…</p>
                </div>
              )}
            </>
          ) : (
            <div className={styles.readerEmpty}>
              <span className={styles.envelope}>
                <MailOpen size={42} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <h2>Select a message</h2>
              <p>
                Read the full update here, then open the related class, session
                or invoice when you need it.
              </p>
              <span className={styles.emptyHint}>
                <CheckCheck size={16} aria-hidden="true" />
                Messages are marked as read when opened.
              </span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

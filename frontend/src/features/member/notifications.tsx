"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { useAction, useApi } from "@/lib/useApi";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { formatDateTime } from "@/lib/format";
import { Tabs, Button } from "@/components/primitives";
import { AsyncSection, Feedback } from "@/components/ui";
import {
  displayMessage,
  memberNotificationHref,
  notificationActionLabel,
  notificationsApi,
  type NotificationDto,
} from "./notifications-api";
import styles from "./member.module.css";

export function MemberNotifications() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const { user } = useAuth();
  const { values, setValues } = useUrlQuery(
    { tab: "all" },
    { tab: choiceQuery(["all", "unread"], "all") },
  );
  const state = useApi(
    (signal) => notificationsApi.list(values.tab === "unread", signal),
    [values.tab],
  );
  const action = useAction();
  async function mark(id?: string) {
    await action.run(async () => {
      if (id) await notificationsApi.read(id);
      else await notificationsApi.readAll();
      state.reload();
      window.dispatchEvent(new Event("sporthub:notifications-read"));
    });
  }
  async function openItem(item: NotificationDto, href: string) {
    if (action.busy) return;
    const ok = await action.run(async () => {
      if (item.status !== "READ")
        await notificationsApi.read(item.notificationId);
      window.dispatchEvent(new Event("sporthub:notifications-read"));
      return true;
    });
    if (ok) router.push(href);
  }
  return (
    <>
      <Button
        variant="secondary"
        disabled={action.busy || !state.data?.some((n) => n.status !== "READ")}
        onClick={() => void mark()}
      >
        {t.refactor.readAll}
      </Button>
      <Feedback error={action.error} />
      <Tabs
        ariaLabel={t.refactor.notifications}
        value={values.tab}
        onChange={(tab) => setValues({ tab })}
        tabs={[
          { id: "all", label: t.memberPages.all },
          { id: "unread", label: t.memberPages.unread },
        ]}
      >
        <AsyncSection
          state={state}
          isEmpty={(rows) => !rows.length}
          emptyMessage={
            values.tab === "unread"
              ? t.memberPages.emptyNotifications
              : t.memberPages.noNotifications
          }
        >
          {(rows) => (
            <ul className={styles.list}>
              {rows.map((n) => {
                const href =
                  user?.role === "Member" ? memberNotificationHref(n) : null;
                return (
                  <li
                    key={n.notificationId}
                    className={styles.item}
                    data-unread={n.status !== "READ"}
                  >
                    <span className={styles.notifDot} aria-hidden="true" />
                    <div>
                      <p className={styles.notifMessage}>
                        {displayMessage(n.message)}
                      </p>
                      <time className={styles.notifTime} dateTime={n.sentAt ?? undefined}>
                        {formatDateTime(n.sentAt)}
                      </time>
                      <div className={styles.notifActions}>
                        {href && (
                          <Link
                            className={styles.notifAction}
                            href={href}
                            onNavigate={(event) => {
                              event.preventDefault();
                              void openItem(n, href);
                            }}
                          >
                            {notificationActionLabel(n, language)} →
                          </Link>
                        )}
                        {n.status !== "READ" && (
                          <Button
                            variant="ghost"
                            disabled={action.busy}
                            onClick={() => void mark(n.notificationId)}
                          >
                            {t.memberPages.read}
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </AsyncSection>
      </Tabs>
    </>
  );
}

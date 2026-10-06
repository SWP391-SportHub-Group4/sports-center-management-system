"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { useAction, useApi } from "@/lib/useApi";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { formatDateTime } from "@/lib/format";
import { Tabs, Button } from "@/components/primitives";
import { AsyncSection, Feedback } from "@/components/ui";
import { memberNotificationHref, notificationsApi } from "./notifications-api";
import styles from "./member.module.css";

export function MemberNotifications() {
  const { t } = useLanguage();
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
  return (
    <>
      <p className="muted">{t.memberPages.notificationsHint}</p>
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
          emptyMessage={t.memberPages.emptyNotifications}
        >
          {(rows) => (
            <ul className={styles.list}>
              {rows.map((n) => {
                const href =
                  user?.role === "Member" ? memberNotificationHref(n) : null;
                return (
                  <li key={n.notificationId} className={styles.item}>
                    {href ? (
                      <Link className={styles.notificationLink} href={href}>
                        {n.message}
                      </Link>
                    ) : (
                      <p>{n.message}</p>
                    )}
                    <p className="muted">
                      <time>{formatDateTime(n.sentAt)}</time> ·{" "}
                      {n.status === "READ"
                        ? t.memberPages.readStatus
                        : t.memberPages.unread}
                    </p>
                    <div className="row">
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

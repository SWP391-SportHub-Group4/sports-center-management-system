"use client";
import Link from "next/link";
import { Tabs } from "@/components/primitives";
import { AsyncSection, Card, StatusChip, Table } from "@/components/ui";
import type { CourseEnrollmentDto, ThresholdResponseDto } from "@/lib/types";
import { api } from "@/lib/apiClient";
import { formatDate } from "@/lib/format";
import { sportTone } from "./event-meta";
import tags from "./tags.module.css";
import styles from "./courses.module.css";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { formatDateTime } from "@/lib/format";
import { memberEnrollments } from "./api";
import { courseApi } from "@/features/courses";
import { CourseInterests } from "@/features/courses";

type TabId = "upcoming" | "ongoing" | "history" | "all";

function classify(e: CourseEnrollmentDto, now: number) {
  const ended =
    e.status !== "CONFIRMED" ||
    ["COMPLETED", "CANCELLED"].includes(e.classStatus) ||
    (!!e.lastSessionEndUtc && new Date(e.lastSessionEndUtc).getTime() <= now);
  const upcoming =
    !ended &&
    (!e.firstSessionStartUtc ||
      new Date(e.firstSessionStartUtc).getTime() > now);
  return { history: ended, upcoming, ongoing: !ended && !upcoming };
}

export function MemberCourses() {
  const { t, language } = useLanguage();
  const c = t.mCourses;
  const now = useNow();
  const state = useApi(memberEnrollments, []);
  const thresholds = useApi(
    (signal) =>
      api
        .get<ThresholdResponseDto[]>("/api/class-threshold-responses/mine", {
          signal,
        })
        .catch(() => [] as ThresholdResponseDto[]),
    [],
  );
  const vi = language === "vi";
  const locale = vi ? "vi-VN" : "en-GB";
  const dayFmt = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  });
  const when = {
    format: (d: Date) => dayFmt.format(d) + " · " + timeFmt.format(d),
  };
  const { values, setValues } = useUrlQuery(
    { tab: "upcoming" },
    {
      tab: choiceQuery(
        ["upcoming", "ongoing", "history", "all", "interests"],
        "upcoming",
      ),
    },
  );
  const tab = values.tab as TabId;
  const rows = state.data ?? [];
  const counts: Record<TabId, number> = {
    upcoming: rows.filter((e) => classify(e, now).upcoming).length,
    ongoing: rows.filter((e) => classify(e, now).ongoing).length,
    history: rows.filter((e) => classify(e, now).history).length,
    all: rows.length,
  };
  const names: Record<TabId, string> = {
    upcoming: c.tabUpcoming,
    ongoing: c.tabOngoing,
    history: c.tabHistory,
    all: c.tabAll,
  };
  const empty: Record<TabId, [string, string]> = {
    upcoming: [c.emptyUpcomingTitle, c.emptyUpcomingBody],
    ongoing: [c.emptyOngoingTitle, c.emptyOngoingBody],
    history: [c.emptyHistoryTitle, c.emptyHistoryBody],
    all: [c.emptyAllTitle, c.emptyAllBody],
  };

  function status(e: CourseEnrollmentDto) {
    const k = classify(e, now);
    if (e.status === "TRANSFERRED_OUT")
      return { label: c.statusTransferred, tone: "neutral" as const };
    if (e.status === "REFUNDED")
      return { label: c.statusRefunded, tone: "neutral" as const };
    if (e.status === "CANCELLED_BY_CENTER")
      return { label: c.statusClassCancelled, tone: "warning" as const };
    if (e.status === "CANCELLED")
      return { label: c.statusCancelled, tone: "warning" as const };
    if (e.classStatus === "CANCELLED")
      return { label: c.statusClassCancelled, tone: "warning" as const };
    if (k.history) return { label: c.statusDone, tone: "neutral" as const };
    if (k.upcoming) return { label: c.statusUpcoming, tone: "info" as const };
    return { label: c.statusOngoing, tone: "success" as const };
  }

  return (
    <>
      <p className={styles.intro}>
        {c.independent.split("Gym & PT")[0]}
        <Link href="/member/services">{c.gymPt}</Link>.
      </p>
      <Tabs
        ariaLabel={c.tabsLabel}
        value={tab}
        onChange={(id) => setValues({ tab: id })}
        tabs={[
          ...(["upcoming", "ongoing", "history", "all"] as const).map((id) => ({
            id,
            label: `${names[id]}${state.data ? ` (${counts[id]})` : ""}`,
          })),
          {
            id: "interests",
            label:
              language === "vi" ? "Nguyện vọng khóa sau" : "Course interests",
          },
        ]}
      >
        {values.tab === "interests" ? (
          <CourseInterests />
        ) : (
          <AsyncSection state={state}>
            {() => {
              const k = (e: CourseEnrollmentDto) => classify(e, now);
              const filtered = rows.filter((e) =>
                tab === "all"
                  ? true
                  : tab === "upcoming"
                    ? k(e).upcoming
                    : tab === "ongoing"
                      ? k(e).ongoing
                      : k(e).history,
              );
              if (!filtered.length)
                return (
                  <div className={styles.empty} data-surface="inverse">
                    <h3>{empty[tab][0]}</h3>
                    <p>{empty[tab][1]}</p>
                    <Link className="btn" href="/member/discover">
                      {c.explore}
                    </Link>
                  </div>
                );
              return (
                <div className={styles.list}>
                  {filtered.map((e) => {
                    const st = status(e);
                    const firstDay = e.firstSessionStartUtc?.slice(0, 10);
                    const pending = (thresholds.data ?? []).find(
                      (r) =>
                        r.classId === e.classId &&
                        r.resolutionStatus === "PENDING" &&
                        !r.choice &&
                        new Date(r.deadlineUtc).getTime() > now,
                    );
                    const left = e.numSessions - (e.completedSessions ?? 0);
                    const renew =
                      e.status === "CONFIRMED" &&
                      e.classStatus !== "CANCELLED" &&
                      !!e.sportId &&
                      (k(e).history || (k(e).ongoing && left <= 2));
                    return (
                      <article key={e.enrollmentId} className={styles.row}>
                        <div className={styles.main}>
                          <div className={styles.head}>
                            <span
                              className={tags.sport}
                              data-sport={sportTone(e.sportName)}
                            >
                              {e.sportName}
                            </span>
                            <StatusChip
                              tone={st.tone}
                              label={st.label}
                              value={e.status}
                            />
                          </div>
                          <h3>{e.className}</h3>
                          <dl className={styles.facts}>
                            <div>
                              <dt>{c.progressLabel}</dt>
                              <dd>
                                {c.progress
                                  .replace(
                                    "{done}",
                                    String(e.completedSessions ?? 0),
                                  )
                                  .replace("{total}", String(e.numSessions))}
                              </dd>
                            </div>
                            <div>
                              <dt>{c.dates}</dt>
                              <dd>
                                {e.firstSessionStartUtc
                                  ? e.lastSessionEndUtc
                                    ? c.datesRange
                                        .replace(
                                          "{from}",
                                          formatDate(e.firstSessionStartUtc),
                                        )
                                        .replace(
                                          "{to}",
                                          formatDate(e.lastSessionEndUtc),
                                        )
                                    : c.datesFrom.replace(
                                        "{from}",
                                        formatDate(e.firstSessionStartUtc),
                                      )
                                  : "—"}
                              </dd>
                            </div>
                            {!k(e).history && e.nextSessionStartUtc && (
                              <div>
                                <dt>{c.nextSession}</dt>
                                <dd>
                                  {when.format(new Date(e.nextSessionStartUtc))}
                                </dd>
                              </div>
                            )}
                            <div>
                              <dt>{c.coach}</dt>
                              <dd>{e.coachName || c.coachTbc}</dd>
                            </div>
                            <div>
                              <dt>{c.room}</dt>
                              <dd>{e.roomName || "—"}</dd>
                            </div>
                          </dl>
                          {pending && (
                            <div className={styles.notice} role="status">
                              <div>
                                <strong>{c.thresholdTitle}</strong>
                                <p>
                                  {c.thresholdBody.replace(
                                    "{deadline}",
                                    formatDateTime(pending.deadlineUtc),
                                  )}
                                </p>
                              </div>
                              <Link
                                className="btn"
                                href={`/member/threshold-responses/${pending.responseId}`}
                              >
                                {c.thresholdCta}
                              </Link>
                            </div>
                          )}
                          {renew && (
                            <Link
                              className={styles.renew}
                              href={`/member/discover?sport=${e.sportId}`}
                            >
                              {c.renew.replace("{sport}", e.sportName)} →
                            </Link>
                          )}
                        </div>
                        <div className={styles.actions}>
                          <Link
                            className="btn"
                            href={`/member/courses/${e.classId}`}
                          >
                            {c.details}
                          </Link>
                          {firstDay && (
                            <Link
                              className="btn btn--secondary"
                              href={`/member/schedule?date=${firstDay}`}
                            >
                              {c.sessions}
                            </Link>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              );
            }}
          </AsyncSection>
        )}
      </Tabs>
    </>
  );
}

function EnrollmentSessions({ classId }: { classId: number }) {
  const { t } = useLanguage();
  const state = useApi(
    (signal) => courseApi.sessions(classId, true, signal),
    [classId],
  );
  return (
    <AsyncSection state={state} isEmpty={(rows) => !rows.length}>
      {(rows) => (
        <Table
          headers={[
            t.refactor.schedule,
            t.operations.room,
            t.operations.coach,
            t.operations.status,
          ]}
        >
          {rows.map((s) => (
            <tr key={s.sessionId}>
              <td>
                {s.sessionNo}. {formatDateTime(s.startAtUtc)} –{" "}
                {formatDateTime(s.endAtUtc)}
                {s.isMakeup && <p>{t.memberPages.makeup}</p>}
              </td>
              <td>{s.roomName}</td>
              <td>{s.coachName}</td>
              <td>
                <StatusChip value={s.status} />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </AsyncSection>
  );
}

export function MemberCourseDetail({ classId }: { classId: number }) {
  const { t } = useLanguage();
  const state = useApi(memberEnrollments, []);
  return (
    <>
      <Link href="/member/courses">{t.memberPages.backCourses}</Link>
      <AsyncSection state={state}>
        {(rows) => {
          const enrollment = rows.find((e) => e.classId === classId);
          if (!enrollment)
            return <p role="status">{t.memberPages.missingCourse}</p>;
          return (
            <>
              <Card title={enrollment.className}>
                <p>
                  {enrollment.classCode} · {enrollment.sportName} ·{" "}
                  <StatusChip value={enrollment.status} />
                </p>
                <p>
                  {t.memberPages.enrollment}:{" "}
                  {formatDateTime(enrollment.enrolledAt)}
                </p>
                <Link
                  href={
                    enrollment.invoiceItemId
                      ? `/member/finance?tab=invoices&invoiceItemId=${encodeURIComponent(enrollment.invoiceItemId)}`
                      : "/member/finance?tab=invoices"
                  }
                >
                  {t.refactor.invoices}
                </Link>
              </Card>
              <EnrollmentSessions classId={classId} />
            </>
          );
        }}
      </AsyncSection>
    </>
  );
}

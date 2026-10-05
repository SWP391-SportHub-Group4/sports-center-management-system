"use client";
import Link from "next/link";
import { Tabs } from "@/components/primitives";
import { AsyncSection, Card, StatusChip, Table } from "@/components/ui";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { formatDateTime } from "@/lib/format";
import { memberEnrollments } from "./api";
import { courseApi } from "@/features/courses";

export function MemberCourses() {
  const { t } = useLanguage();
  const now = useNow();
  const state = useApi(memberEnrollments, []);
  const { values, setValues } = useUrlQuery(
    { tab: "upcoming" },
    { tab: choiceQuery(["upcoming", "ongoing", "history", "all"], "upcoming") },
  );
  return (
    <>
      <Tabs
        ariaLabel={t.memberPages.courses}
        value={values.tab}
        onChange={(tab) => setValues({ tab })}
        tabs={(["upcoming", "ongoing", "history", "all"] as const).map(
          (id) => ({ id, label: t.memberPages[id] }),
        )}
      >
        <AsyncSection state={state}>
          {(rows) => {
            const filtered = rows.filter((e) => {
              const history =
                e.status !== "CONFIRMED" ||
                ["COMPLETED", "CANCELLED"].includes(e.classStatus);
              const upcoming =
                !history &&
                (!e.firstSessionStartUtc ||
                  new Date(e.firstSessionStartUtc).getTime() > now);
              return (
                values.tab === "all" ||
                (values.tab === "history"
                  ? history
                  : values.tab === "upcoming"
                    ? upcoming
                    : !history && !upcoming)
              );
            });
            return filtered.length ? (
              <div className="stack">
                {filtered.map((e) => (
                  <Card key={e.enrollmentId} title={e.className}>
                    <p>
                      {e.sportName} · <StatusChip value={e.status} /> ·{" "}
                      <StatusChip value={e.classStatus} />
                    </p>
                    <p>
                      {formatDateTime(e.firstSessionStartUtc)} · {e.numSessions}{" "}
                      {t.refactor.sessions}
                    </p>
                    <Link href={`/member/courses/${e.classId}`}>
                      {t.refactor.details}
                    </Link>
                  </Card>
                ))}
              </div>
            ) : (
              <p>{t.memberPages.emptyCourses}</p>
            );
          }}
        </AsyncSection>
      </Tabs>
      <Link href="/member/discover">{t.memberPages.discover}</Link>
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

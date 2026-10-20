"use client";
import managementStyles from "./course-management.module.css";
import studentStyles from "./course-students.module.css";
import detailStyles from "./course-detail.module.css";
import { EnrollmentSummary } from "./enrollment-summary";
import { UserAvatar } from "@/components/UserAvatar";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { formatMoney, formatDateTime } from "@/lib/format";
import { Card, AsyncSection, Table, StatusChip, Dialog } from "@/components/ui";
import { Tabs } from "@/components/primitives";
import { LockKeyhole } from "lucide-react";
import { CoursePublishReview } from "./course-publish-review";
import { SessionEditor } from "./session-editor";
import { ThresholdPanel } from "./threshold-panel";
import { CourseOperations, CourseCancellation } from "./course-operations";
import { CourseHistory } from "./course-history";
import { managerWorkspaceStyles as styles } from "@/features/manager";
import type {
  ManagerCourseDto,
  CourseSessionDto,
  CourseRosterDto,
} from "@/lib/types";
const tabIds = [
  "overview",
  "sessions",
  "students",
  "holds",
  "threshold",
  "history",
  "management",
];
function Roster({ sessionId }: { sessionId: string }) {
  const { t } = useLanguage();
  const state = useApi(
    (signal) =>
      api.get<CourseRosterDto>(`/api/class-sessions/${sessionId}/roster`, {
        signal,
      }),
    [sessionId],
  );
  return (
    <AsyncSection state={state}>
      {(data) => (
        <div className={detailStyles.attendanceTable}>
          <Table
            headers={[
              t.operations.member,
              t.operations.status,
              t.operations.attendance,
            ]}
          >
            {data.entries.map((r) => (
              <tr key={r.enrollmentId}>
                <td>
                  <div className={detailStyles.attendanceMember}>
                    <UserAvatar
                      userId={r.memberId}
                      name={r.memberName}
                      size={28}
                    />
                    <span>{r.memberName}</span>
                  </div>
                </td>
                <td>
                  <StatusChip value={r.enrollmentStatus} />
                </td>
                <td>
                  <StatusChip value={r.attendanceStatus} />
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </AsyncSection>
  );
}
export function ManagerCourseDetail({ classId }: { classId: number }) {
  const { t } = useLanguage();
  const l = t.operations;
  const m = t.managerOperations;
  const { values, setValues } = useUrlQuery(
    { tab: "overview" },
    { tab: choiceQuery(tabIds, "overview") },
  );
  const [cancelling, setCancelling] = useState(false);
  const [managementView, setManagementView] = useState("enrollment");
  const activeTab =
    values.tab === "holds"
      ? "students"
      : ["threshold", "history"].includes(values.tab)
        ? "management"
        : values.tab;
  const managementSection = ["threshold", "history"].includes(values.tab)
    ? values.tab
    : managementView;
  useEffect(() => {
    if (window.location.hash !== "#course-cancellation") return;
    const frame = requestAnimationFrame(() => setCancelling(true));
    return () => cancelAnimationFrame(frame);
  }, [values.tab]);
  const [publishing, setPublishing] = useState(false);
  const [session, setSession] = useState<CourseSessionDto | null>(null);
  const [roster, setRoster] = useState("");
  const [revision, setRevision] = useState(0);
  const state = useApi(
    (signal) =>
      api.get<ManagerCourseDto>(`/api/manager/classes/${classId}`, { signal }),
    [classId],
  );
  const sessions = useApi(
    (signal) =>
      values.tab === "sessions"
        ? api.get<CourseSessionDto[]>(`/api/classes/${classId}/sessions`, {
            signal,
          })
        : Promise.resolve([]),
    [classId, values.tab, revision],
  );
  function reload() {
    state.reload();
    setRevision((n) => n + 1);
    setPublishing(false);
    setSession(null);
  }
  return (
    <div className={`${styles.classDetail} ${detailStyles.page}`}>
      <Link className="btn btn--ghost" href="/manager/classes">
        {m.backToList}
      </Link>
      <AsyncSection state={state}>
        {(c) => (
          <>
            <Card
              title={c.name}
              hint={c.code}
              actions={
                <>
                  <StatusChip value={c.status} />
                  {c.status === "DRAFT" && (
                    <>
                      <Link
                        className="btn btn--secondary"
                        href={`/manager/classes/${classId}/edit`}
                      >
                        {l.edit}
                      </Link>
                      <button
                        className="btn"
                        onClick={() => setPublishing(true)}
                      >
                        {l.publish}
                      </button>
                    </>
                  )}
                  <Link
                    className={
                      c.status === "DRAFT" ? "btn btn--secondary" : "btn"
                    }
                    href={`/manager/schedule?classId=${classId}`}
                  >
                    {t.classWorkspace.viewSchedule}
                  </Link>
                  <button className="btn btn--ghost" onClick={reload}>
                    {l.refresh}
                  </button>
                </>
              }
            >
              <div className={detailStyles.headerSummary}>
                <dl className={styles.classMeta}>
                  <div>
                    <dt>{l.sport}</dt>
                    <dd>{c.sportName}</dd>
                  </div>
                  <div>
                    <dt>{l.coach}</dt>
                    <dd>{c.coachName ?? t.managerAudit.nameUnavailable}</dd>
                  </div>
                  <div>
                    <dt>{l.room}</dt>
                    <dd>{c.roomName}</dd>
                  </div>
                </dl>
                <EnrollmentSummary course={c} />
              </div>
            </Card>
            <Tabs
              ariaLabel={l.details}
              tabs={[
                { id: "overview", label: m.overviewTab },
                { id: "sessions", label: m.sessionsTab },
                { id: "students", label: m.studentsTab },
                { id: "management", label: t.classWorkspace.management },
              ]}
              value={activeTab}
              onChange={(tab) => setValues({ tab })}
            >
              {values.tab === "overview" && (
                <div className="stack">
                  <Card title={t.classWorkspace.information}>
                    <dl className={styles.summary}>
                      {[
                        [t.classWorkspace.price, formatMoney(c.price)],
                        [l.numSessions, String(c.numSessions)],
                        [l.startDate, c.startDate],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className={detailStyles.enrollmentStatus}>
                      <div>
                        <span className="muted">{m.enrollmentTitle}</span>
                        <p className={detailStyles.enrollmentLabel}>
                          <strong
                            className={managementStyles.enrollmentState}
                            data-open={c.enrollmentOpen}
                          >
                            {c.enrollmentOpen
                              ? m.enrollmentOpen
                              : m.enrollmentClosed}
                          </strong>
                        </p>
                      </div>
                      <button
                        className="btn btn--ghost"
                        onClick={() => {
                          setManagementView("enrollment");
                          setValues({ tab: "management" });
                        }}
                      >
                        {t.classWorkspace.manageEnrollment}
                      </button>
                    </div>
                    {!["MET", "WAIVED_BY_MANAGER"].includes(
                      c.thresholdStatus,
                    ) &&
                      c.status === "PUBLISHED" && (
                        <div className={detailStyles.thresholdNotice}>
                          <div>
                            <strong>{l.threshold}</strong>
                            <p>
                              {c.confirmedCount} /{" "}
                              {c.breakEvenThreshold ??
                                (c.price > 0
                                  ? Math.ceil(c.costAmount / c.price)
                                  : 0)}{" "}
                              <StatusChip value={c.thresholdStatus} />
                            </p>
                          </div>
                          <button
                            className="btn btn--secondary"
                            onClick={() => setValues({ tab: "threshold" })}
                          >
                            {t.classWorkspace.reviewThreshold}
                          </button>
                        </div>
                      )}
                  </Card>
                </div>
              )}
              {values.tab === "sessions" && (
                <Card title={m.sessionsTab}>
                  <AsyncSection state={sessions}>
                    {(rows) => (
                      <>
                        <Table
                          headers={[
                            l.start,
                            l.end,
                            l.room,
                            l.coach,
                            l.status,
                            "",
                          ]}
                        >
                          {rows.map((s) => (
                            <tr key={s.sessionId}>
                              <td>{formatDateTime(s.startAtUtc)}</td>
                              <td>{formatDateTime(s.endAtUtc)}</td>
                              <td>{s.roomName}</td>
                              <td>{s.coachName}</td>
                              <td>
                                <StatusChip value={s.status} />
                              </td>
                              <td>
                                <button
                                  className="btn btn--secondary"
                                  onClick={() => setRoster(s.sessionId)}
                                >
                                  {l.attendance}
                                </button>
                                {s.status === "SCHEDULED" &&
                                  !["CANCELLED", "COMPLETED"].includes(
                                    c.status,
                                  ) && (
                                    <button
                                      className="btn btn--ghost"
                                      onClick={() => setSession(s)}
                                    >
                                      {l.edit}
                                    </button>
                                  )}
                              </td>
                            </tr>
                          ))}
                        </Table>
                        {!rows.length && (
                          <p>
                            {c.status === "DRAFT"
                              ? m.draftHint
                              : m.noActivities}
                          </p>
                        )}
                      </>
                    )}
                  </AsyncSection>
                </Card>
              )}
              {activeTab === "students" && (
                <CourseOperations
                  key={values.tab + revision}
                  classId={classId}
                  kind={values.tab === "holds" ? "holds" : "enrollments"}
                  toolbar={
                    <div
                      className={studentStyles.filters}
                      role="group"
                      aria-label={t.classWorkspace.studentFilter}
                    >
                      <button
                        type="button"
                        aria-pressed={values.tab !== "holds"}
                        onClick={() => setValues({ tab: "students" })}
                      >
                        {t.classWorkspace.enrolledLabel}{" "}
                        <span>{c.confirmedCount}</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={values.tab === "holds"}
                        onClick={() => setValues({ tab: "holds" })}
                      >
                        {m.holdsTab} <span>{c.activeHoldCount}</span>
                      </button>
                    </div>
                  }
                />
              )}
              {activeTab === "management" && (
                <div className="stack">
                  <div
                    className={managementStyles.navigation}
                    role="group"
                    aria-label={t.classWorkspace.management}
                  >
                    {[
                      { id: "enrollment", label: m.enrollmentTitle },
                      { id: "threshold", label: m.thresholdTab },
                      { id: "history", label: m.historyTab },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={managementSection === item.id}
                        onClick={() => {
                          setManagementView(item.id);
                          setValues({ tab: "management" });
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {managementSection === "enrollment" && (
                    <Card title={m.enrollmentTitle}>
                      <section className={managementStyles.enrollment}>
                        <div>
                          <strong
                            className={managementStyles.enrollmentState}
                            data-open={c.enrollmentOpen}
                          >
                            {c.confirmedCount >= c.capacity
                              ? m.enrollmentFull
                              : c.enrollmentOpen
                                ? m.enrollmentOpen
                                : m.enrollmentClosed}
                          </strong>
                          <p className="small muted">
                            {c.status === "DRAFT"
                              ? m.enrollmentOpensOnPublish
                              : c.confirmedCount >= c.capacity
                                ? m.enrollmentFullHint
                                : m.enrollmentAutomaticHint}
                          </p>
                        </div>
                      </section>
                    </Card>
                  )}
                  {managementSection === "threshold" && (
                    <>
                      <ThresholdPanel
                        key={c.version + "-" + revision}
                        course={c}
                        onSaved={reload}
                      />
                      <details className={managementStyles.responses}>
                        <summary>{l.thresholdResponses}</summary>
                        <CourseOperations
                          key={"responses-" + revision}
                          classId={classId}
                          kind="threshold-responses"
                        />
                      </details>
                    </>
                  )}
                  {managementSection === "history" && (
                    <Card title={m.historyTab}>
                      <dl className={managementStyles.auditMeta}>
                        <div>
                          <dt>{m.created}</dt>
                          <dd>{formatDateTime(c.createdAt)}</dd>
                        </div>
                        <div>
                          <dt>{m.published}</dt>
                          <dd>
                            {c.publishedAt
                              ? formatDateTime(c.publishedAt)
                              : "\u2014"}
                          </dd>
                        </div>
                        <div>
                          <dt>{m.version}</dt>
                          <dd>{c.version}</dd>
                        </div>
                      </dl>
                      <CourseHistory
                        key={"history-" + revision}
                        classId={classId}
                      />
                    </Card>
                  )}
                  {!["CANCELLED", "COMPLETED"].includes(c.status) && (
                    <div
                      className={managementStyles.cancellation}
                      data-blocked={c.confirmedCount > 0}
                    >
                      {c.confirmedCount > 0 && (
                        <LockKeyhole size={20} aria-hidden="true" />
                      )}
                      <div>
                        <strong>
                          {c.confirmedCount > 0
                            ? t.classWorkspace.cancellationUnavailable
                            : t.classWorkspace.cancelClass}
                        </strong>
                        <p>
                          {c.confirmedCount > 0
                            ? t.classWorkspace.enrolledCancellationBlocked
                            : t.classWorkspace.cancelClassHint}
                        </p>
                      </div>
                      {c.confirmedCount === 0 ? (
                        <button
                          className="btn btn--danger"
                          onClick={() => setCancelling(true)}
                        >
                          {t.classWorkspace.cancelClass}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--secondary"
                          onClick={() => setValues({ tab: "sessions" })}
                        >
                          {t.classWorkspace.viewSchedule}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Tabs>
            {cancelling && c.confirmedCount === 0 && (
              <Dialog
                title={t.classWorkspace.cancelClass}
                onClose={() => setCancelling(false)}
                size="lg"
              >
                <CourseCancellation
                  classId={classId}
                  embedded
                  onSaved={() => {
                    setCancelling(false);
                    reload();
                  }}
                />
              </Dialog>
            )}
            {publishing && (
              <Dialog
                title={l.publish}
                size="lg"
                onClose={() => setPublishing(false)}
              >
                <CoursePublishReview course={c} onSaved={reload} />
              </Dialog>
            )}
            {session && (
              <Dialog
                title={t.classWorkspace.editSession}
                className={managementStyles.sessionDialog}
                onClose={() => setSession(null)}
              >
                <SessionEditor
                  key={session.sessionId}
                  session={session}
                  sportId={c.sportId}
                  capacity={c.capacity}
                  confirmedCount={c.confirmedCount}
                  embedded
                  showCloseButton={false}
                  showReviewActions={false}
                  showWeeklySchedule
                  onSaved={() => {
                    setSession(null);
                    reload();
                  }}
                  onClose={() => setSession(null)}
                />
              </Dialog>
            )}
            {roster && (
              <Dialog
                title={l.attendance}
                size="lg"
                onClose={() => setRoster("")}
              >
                <Roster sessionId={roster} />
              </Dialog>
            )}
          </>
        )}
      </AsyncSection>
    </div>
  );
}

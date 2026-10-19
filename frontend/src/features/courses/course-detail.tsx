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
import {
  Card,
  AsyncSection,
  Table,
  StatusChip,
  Dialog,
  Field,
} from "@/components/ui";
import { Tabs } from "@/components/primitives";
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
                      report
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
  const [enrollmentBusy, setEnrollmentBusy] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [cancelReasonSeed, setCancelReasonSeed] = useState("");
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
  async function setEnrollmentOpen(open: boolean) {
    setEnrollmentBusy(true);
    setEnrollmentError(null);

    try {
      await api.post(
        `/api/manager/classes/${classId}/enrollment/${open ? "open" : "close"}`,
        open ? undefined : { reason: closeReason.trim() || null },
      );

      setClosing(false);
      setCloseReason("");
      reload();
    } catch (error) {
      setEnrollmentError(
        error instanceof Error ? error.message : m.enrollmentUpdateError,
      );
    } finally {
      setEnrollmentBusy(false);
    }
  }
  function goToCancellation() {
    setCancelReasonSeed(closeReason.trim());
    setClosing(false);
    setCancelling(true);
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
                        [l.price, formatMoney(c.price)],
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
                        <p>
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
                          <strong>
                            {c.enrollmentOpen
                              ? m.enrollmentOpen
                              : m.enrollmentClosed}
                          </strong>

                          <p className="small muted">
                            {c.enrollmentOpen
                              ? m.enrollmentOpenHint
                              : m.enrollmentClosedHint}
                          </p>
                          {!c.enrollmentOpen && c.enrollmentClosedAtUtc && (
                            <p className="small muted">
                              {m.enrollmentClosedSince.replace(
                                "{when}",
                                formatDateTime(c.enrollmentClosedAtUtc),
                              )}
                              {c.enrollmentClosedReason &&
                                ` · ${m.enrollmentClosedReason}: ${c.enrollmentClosedReason}`}
                            </p>
                          )}
                        </div>

                        {c.status === "PUBLISHED" && (
                          <button
                            type="button"
                            className={
                              c.enrollmentOpen ? "btn btn--secondary" : "btn"
                            }
                            disabled={enrollmentBusy}
                            onClick={() =>
                              c.enrollmentOpen
                                ? setClosing(true)
                                : c.enrollmentClosedReason &&
                                    c.confirmedCount > 0
                                  ? setReopening(true)
                                  : void setEnrollmentOpen(true)
                            }
                          >
                            {enrollmentBusy
                              ? t.common.loading
                              : c.enrollmentOpen
                                ? m.closeEnrollment
                                : m.reopenEnrollment}
                          </button>
                        )}
                        {enrollmentError && (
                          <p role="alert" className="error">
                            {enrollmentError}
                          </p>
                        )}
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
                    <div className={managementStyles.cancellation}>
                      <div>
                        <strong>{t.classWorkspace.cancelClass}</strong>
                        <p>{t.classWorkspace.cancelClassHint}</p>
                      </div>
                      <button
                        className="btn btn--secondary"
                        onClick={() => setCancelling(true)}
                      >
                        {t.classWorkspace.cancelClass}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </Tabs>
            {cancelling && (
              <Dialog
                title={t.classWorkspace.cancelClass}
                onClose={() => setCancelling(false)}
                size="lg"
              >
                <CourseCancellation
                  key={cancelReasonSeed}
                  classId={classId}
                  embedded
                  initialReason={cancelReasonSeed}
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
                title={l.sessions}
                size="lg"
                onClose={() => setSession(null)}
              >
                <SessionEditor
                  key={session.sessionId}
                  session={session}
                  sportId={c.sportId}
                  capacity={c.capacity}
                  onSaved={reload}
                  onClose={() => setSession(null)}
                />
              </Dialog>
            )}
            {closing && (
              <Dialog
                title={m.closeDialogTitle}
                description={m.closeDialogLead}
                onClose={() => !enrollmentBusy && setClosing(false)}
                footer={
                  <>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={enrollmentBusy}
                      onClick={() => setClosing(false)}
                    >
                      {t.common.cancel}
                    </button>
                    <button
                      type="submit"
                      form="close-enrollment-form"
                      className="btn"
                      disabled={enrollmentBusy}
                    >
                      {enrollmentBusy ? t.common.loading : m.closeEnrollment}
                    </button>
                  </>
                }
              >
                <form
                  id="close-enrollment-form"
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void setEnrollmentOpen(false);
                  }}
                >
                  <dl className={styles.summary}>
                    <div>
                      <dt>{m.closeStatHolds}</dt>
                      <dd>{c.activeHoldCount}</dd>
                    </div>
                    <div>
                      <dt>{m.closeStatEnrolled}</dt>
                      <dd>{c.confirmedCount}</dd>
                    </div>
                  </dl>
                  <p>{m.closeHoldsExplain}</p>
                  <Field
                    label={m.closeReasonLabel}
                    hint={m.closeReasonHint}
                    required
                  >
                    <textarea
                      required
                      minLength={3}
                      maxLength={500}
                      rows={3}
                      value={closeReason}
                      onChange={(e) => setCloseReason(e.target.value)}
                    />
                  </Field>
                  <p role="status">
                    {c.confirmedCount > 0
                      ? m.closeNotifiesSome
                      : m.closeNotifiesNone}
                  </p>
                  {enrollmentError && (
                    <p role="alert" className="error">
                      {enrollmentError}
                    </p>
                  )}
                  {!["CANCELLED", "COMPLETED"].includes(c.status) && (
                    <div>
                      <h3>{m.closeRefundTitle}</h3>
                      <p className="small muted">{m.closeRefundBody}</p>
                      <button
                        type="button"
                        className="btn btn--quiet"
                        onClick={goToCancellation}
                      >
                        {m.closeGoToCancel}
                      </button>
                    </div>
                  )}
                </form>
              </Dialog>
            )}
            {reopening && (
              <Dialog
                title={m.reopenDialogTitle}
                description={m.reopenNotifiesHint}
                onClose={() => !enrollmentBusy && setReopening(false)}
                footer={
                  <>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={enrollmentBusy}
                      onClick={() => setReopening(false)}
                    >
                      {t.common.cancel}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={enrollmentBusy}
                      onClick={async () => {
                        await setEnrollmentOpen(true);
                        setReopening(false);
                      }}
                    >
                      {enrollmentBusy ? t.common.loading : m.reopenEnrollment}
                    </button>
                  </>
                }
              >
                {enrollmentError && (
                  <p role="alert" className="error">
                    {enrollmentError}
                  </p>
                )}
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

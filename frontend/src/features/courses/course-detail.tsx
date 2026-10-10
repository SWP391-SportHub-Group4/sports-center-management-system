"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { Card, AsyncSection, Table, StatusChip, Dialog } from "@/components/ui";
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
        <Table
          headers={[
            t.operations.member,
            t.operations.status,
            t.operations.attendance,
          ]}
        >
          {data.entries.map((r) => (
            <tr key={r.enrollmentId}>
              <td>{r.memberName}</td>
              <td>
                <StatusChip value={r.enrollmentStatus} />
              </td>
              <td>
                <StatusChip value={r.attendanceStatus} />
              </td>
            </tr>
          ))}
        </Table>
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
    <>
      <Link className="btn btn--ghost" href="/manager/classes">
        {m.backToList}
      </Link>
      <AsyncSection state={state}>
        {(c) => (
          <>
            <Card
              title={c.name}
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
                  <button className="btn btn--ghost" onClick={reload}>
                    {l.refresh}
                  </button>
                </>
              }
            >
              <p>
                {c.sportName} · {c.coachName ?? "—"} · {c.roomName}
              </p>
              <dl className={styles.summary}>
                <div>
                  <dt>{l.confirmed}</dt>
                  <dd>
                    {c.confirmedCount}/{c.capacity}
                  </dd>
                </div>
                <div>
                  <dt>{l.held}</dt>
                  <dd>{c.activeHoldCount}</dd>
                </div>
                <div>
                  <dt>{l.availableSeats}</dt>
                  <dd>{c.availableSeats}</dd>
                </div>
                <div>
                  <dt>{l.threshold}</dt>
                  <dd>
                    {c.breakEvenThreshold ?? Math.ceil(c.costAmount / c.price)}{" "}
                    · <StatusChip value={c.thresholdStatus} />
                  </dd>
                </div>
              </dl>
            </Card>
            <Tabs
              ariaLabel={l.details}
              tabs={tabIds.map((id) => ({
                id,
                label:
                  m[
                    `${id === "students" ? "students" : id}Tab` as
                      | "overviewTab"
                      | "sessionsTab"
                      | "studentsTab"
                      | "holdsTab"
                      | "thresholdTab"
                      | "historyTab"
                  ],
              }))}
              value={values.tab}
              onChange={(tab) => setValues({ tab })}
            >
              {values.tab === "overview" && (
                <div className="stack">
                  <Card title={m.overviewTab}>
                    <dl className={styles.summary}>
                      {[
                        [l.price, formatMoney(c.price)],
                        [l.cost, formatMoney(c.costAmount)],
                        [l.numSessions, String(c.numSessions)],
                        [l.startDate, formatDate(c.startDate)],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p>{m.holdHint}</p>
                  </Card>
                  {!["CANCELLED", "COMPLETED"].includes(c.status) && (
                    <CourseCancellation classId={classId} onSaved={reload} />
                  )}
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
                                  {l.roster}
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
              {values.tab === "students" && (
                <CourseOperations
                  key={`students-${revision}`}
                  classId={classId}
                  kind="enrollments"
                />
              )}
              {values.tab === "holds" && (
                <>
                  <p>{m.holdHint}</p>
                  <CourseOperations
                    key={`holds-${revision}`}
                    classId={classId}
                    kind="holds"
                  />
                </>
              )}
              {values.tab === "threshold" && (
                <div className="stack">
                  <ThresholdPanel
                    key={`${c.version}-${revision}`}
                    course={c}
                    onSaved={reload}
                  />
                  <CourseOperations
                    key={`responses-${revision}`}
                    classId={classId}
                    kind="threshold-responses"
                  />
                </div>
              )}
              {values.tab === "history" && (
                <CourseHistory key={`history-${revision}`} classId={classId} />
              )}
            </Tabs>
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
            {roster && (
              <Dialog title={l.roster} size="lg" onClose={() => setRoster("")}>
                <Roster sessionId={roster} />
              </Dialog>
            )}
          </>
        )}
      </AsyncSection>
    </>
  );
}

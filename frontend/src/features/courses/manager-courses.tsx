"use client";
import { pagedItems } from "@/lib/paged";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatDateTime } from "@/lib/format";
import { Card, AsyncSection, Field, Table, StatusChip } from "@/components/ui";
import { Pagination } from "@/features/operations";
import { CourseOperations, CourseCancellation } from "./course-operations";
import { catalogApi } from "@/features/catalog";
import type {
  ManagerCourseDto,
  Paged,
  CourseSessionDto,
  CourseRosterDto,
} from "@/lib/types";
import { CourseEditor } from "./course-editor";
import { CoursePublishReview } from "./course-publish-review";
import { SessionEditor } from "./session-editor";
import { ThresholdPanel } from "./threshold-panel";
export function ManagerCourses() {
  const { t } = useLanguage();
  const l = t.operations;
  const [page, setPage] = useState(1);
  const [sportId, setSport] = useState("");
  const [status, setStatus] = useState("");
  const [thresholdStatus, setThresholdStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [creating, setCreating] = useState(false);
  const sports = useApi((s) => catalogApi.sports(s, true), []);
  const courses = useApi(
    (s) =>
      api.get<Paged<ManagerCourseDto>>("/api/manager/classes", {
        signal: s,
        query: {
          page,
          pageSize: 20,
          sportId,
          status,
          thresholdStatus,
          keyword,
        },
      }),
    [page, sportId, status, thresholdStatus, keyword],
  );
  return (
    <>
      <button className="btn" onClick={() => setCreating(true)}>
        {l.create}
      </button>
      {creating && (
        <CourseEditor
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            courses.reload();
          }}
        />
      )}
      <div className="form-grid">
        <Field label={l.sport}>
          <select
            value={sportId}
            onChange={(e) => {
              setSport(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{l.all}</option>
            {sports.data
              ?.filter((s) => s.operationType === "GROUP_COURSE")
              .map((s) => (
                <option key={s.sportId} value={s.sportId}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={l.status}>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{l.all}</option>
            {[
              "DRAFT",
              "PUBLISHED",
              "IN_PROGRESS",
              "COMPLETED",
              "CANCELLED",
            ].map((s) => (
              <option value={s} key={s}>
                {t.wireStatus[s as keyof typeof t.wireStatus] ?? s}
              </option>
            ))}
          </select>
        </Field>
        <Field label={l.thresholdFilter}>
          <select
            value={thresholdStatus}
            onChange={(e) => {
              setThresholdStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{l.all}</option>
            {["NOT_EVALUATED", "MET", "AT_RISK", "WAIVED_BY_MANAGER"].map(
              (value) => (
                <option key={value} value={value}>
                  {t.wireStatus[value as keyof typeof t.wireStatus] ?? value}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label={l.search}>
          <input
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
          />
        </Field>
      </div>
      <AsyncSection state={courses}>
        {(data) => (
          <>
            <Table
              headers={[
                l.code,
                l.name,
                l.sport,
                l.status,
                l.confirmed,
                l.held,
                l.threshold,
                l.price,
                "",
              ]}
            >
              {pagedItems(data).map((c) => (
                <tr key={c.classId}>
                  <td>{c.code}</td>
                  <td>{c.name}</td>
                  <td>{c.sportName}</td>
                  <td>
                    <StatusChip value={c.status} />
                  </td>
                  <td>
                    {c.confirmedCount}/{c.capacity}
                  </td>
                  <td>{c.activeHoldCount}</td>
                  <td>
                    <StatusChip value={c.thresholdStatus} /> ·{" "}
                    {c.breakEvenThreshold ?? "—"}
                  </td>
                  <td>{formatMoney(c.price)}</td>
                  <td>
                    <Link
                      className="btn btn--secondary"
                      href={`/manager/classes/${c.classId}`}
                    >
                      {l.details}
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination
              page={page}
              count={data.totalCount}
              onChange={setPage}
            />
          </>
        )}
      </AsyncSection>
    </>
  );
}
function CourseRoster({ sessionId }: { sessionId: string }) {
  const { t } = useLanguage();
  const l = t.operations;
  const state = useApi(
    (s) =>
      api.get<CourseRosterDto>(`/api/class-sessions/${sessionId}/roster`, {
        signal: s,
      }),
    [sessionId],
  );
  return (
    <AsyncSection state={state}>
      {(data) => (
        <Table headers={[l.member, l.status, l.attendance]}>
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
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [session, setSession] = useState<CourseSessionDto | null>(null);
  const [rosterId, setRoster] = useState("");

  const state = useApi(
    (s) =>
      api.get<ManagerCourseDto>(`/api/manager/classes/${classId}`, {
        signal: s,
      }),
    [classId],
  );
  const sessions = useApi(
    (s) =>
      api.get<CourseSessionDto[]>(`/api/classes/${classId}/sessions`, {
        signal: s,
      }),
    [classId],
  );
  function reload() {
    state.reload();
    sessions.reload();
    setEditing(false);
    setPublishing(false);
    setSession(null);
  }
  return (
    <AsyncSection state={state}>
      {(c) => (
        <>
          <Card title={`${c.code} · ${c.name}`}>
            <p>
              {c.sportName} · {c.coachName} · {c.roomName}
            </p>
            <StatusChip value={c.status} />
            <p>
              {l.numSessions}: {c.numSessions} · {l.price}:{" "}
              {formatMoney(c.price)} · {l.confirmed}: {c.confirmedCount} ·{" "}
              {l.held}: {c.activeHoldCount} · {l.availableSeats}:{" "}
              {c.availableSeats}
            </p>

            <div className="btn-row">
              {c.status === "DRAFT" && (
                <>
                  <button
                    className="btn btn--secondary"
                    onClick={() => setEditing(true)}
                  >
                    {l.edit}
                  </button>
                  <button className="btn" onClick={() => setPublishing(true)}>
                    {l.publish}
                  </button>
                </>
              )}
              <button className="btn btn--ghost" onClick={reload}>
                {l.refresh}
              </button>
            </div>
          </Card>
          {editing && (
            <CourseEditor
              key={`${classId}-${c.version}`}
              course={c}
              onClose={() => setEditing(false)}
              onSaved={reload}
            />
          )}
          {publishing && <CoursePublishReview course={c} onSaved={reload} />}
          {c.status !== "DRAFT" && (
            <ThresholdPanel
              key={`${classId}-${c.price}-${c.costAmount}-${c.thresholdStatus}`}
              course={c}
              onSaved={reload}
            />
          )}
          <Card title={l.sessions}>
            <AsyncSection state={sessions}>
              {(rows) => (
                <Table
                  headers={[l.start, l.end, l.room, l.coach, l.status, ""]}
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
                        {s.status === "SCHEDULED" && (
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
              )}
            </AsyncSection>
          </Card>
          {session && (
            <SessionEditor
              key={session.sessionId}
              session={session}
              sportId={c.sportId}
              onSaved={reload}
              onClose={() => setSession(null)}
            />
          )}
          {rosterId && (
            <Card title={l.roster}>
              <CourseRoster key={rosterId} sessionId={rosterId} />
            </Card>
          )}
          <CourseOperations key={c.version} classId={classId} />
          {!["CANCELLED", "COMPLETED"].includes(c.status) && (
            <CourseCancellation classId={classId} onSaved={reload} />
          )}
        </>
      )}
    </AsyncSection>
  );
}

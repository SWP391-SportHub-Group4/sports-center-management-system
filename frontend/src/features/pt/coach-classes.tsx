"use client";

import { useState } from "react";
import Link from "next/link";

import {
  AsyncSection,
  Card,
  Field,
  Stat,
  StatusChip,
  Table,
} from "@/components/ui";

import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { addDaysIso, formatDateTime, todayIso } from "@/lib/format";

import { courtScheduleApi } from "@/features/court-schedule";
import { catalogApi } from "@/features/catalog";

import { ptApi } from "./api";
import { UserAvatar } from "@/components/UserAvatar";

function Roster({ id }: { id: string }) {
  const { t } = useLanguage();

  const state = useApi((signal) => ptApi.roster(id, signal), [id]);

  return (
    <AsyncSection state={state}>
      {(data) => (
        <Table
          headers={[t.staffWork.member, t.staffWork.status, t.staffWork.time]}
        >
          {data.entries.map((row) => (
            <tr key={row.enrollmentId}>
              <td>
                <UserAvatar
                  userId={row.memberId}
                  name={row.memberName}
                  size={28}
                  report
                />{" "}
                {row.memberName}
              </td>

              <td>
                <StatusChip
                  value={row.attendanceStatus ?? row.enrollmentStatus}
                />
              </td>

              <td>
                {row.attendanceRecordedAt
                  ? formatDateTime(row.attendanceRecordedAt)
                  : "—"}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </AsyncSection>
  );
}

export function CoachClassDetail({ classId }: { classId: number }) {
  const { t } = useLanguage();

  const [sessionId, setSessionId] = useState("");

  const state = useApi(
    (signal) => ptApi.classSessions(classId, signal),
    [classId],
  );

  return (
    <Card title={t.staffWork.attendance} hint={t.staffWork.readOnly}>
      <AsyncSection
        state={state}
        isEmpty={(rows) => !rows.length}
        emptyMessage={t.common.noData}
      >
        {(rows) => {
          const selected =
            rows.find((row) => row.sessionId === sessionId) ?? null;

          return (
            <div className="stack">
              <Field label={t.operations.classSession}>
                <select
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                >
                  <option value="">—</option>

                  {rows.map((row) => (
                    <option key={row.sessionId} value={row.sessionId}>
                      {formatDateTime(row.startAtUtc)}
                      {" · "}
                      {row.roomName}
                    </option>
                  ))}
                </select>
              </Field>

              {selected ? (
                <>
                  <div className="card">
                    <div className="row spread">
                      <div>
                        <strong>{formatDateTime(selected.startAtUtc)}</strong>

                        <p className="muted">
                          {formatDateTime(selected.endAtUtc)}
                        </p>
                      </div>

                      <StatusChip value={selected.status} />
                    </div>

                    <dl className="stack">
                      <div className="row spread">
                        <dt>{t.staffWork.room}</dt>
                        <dd>{selected.roomName || "—"}</dd>
                      </div>

                      <div className="row spread">
                        <dt>{t.staffWork.coach}</dt>
                        <dd>{selected.coachName || "—"}</dd>
                      </div>
                    </dl>
                  </div>

                  <Roster key={selected.sessionId} id={selected.sessionId} />
                </>
              ) : (
                <p className="muted">{t.staffWork.readOnly}</p>
              )}
            </div>
          );
        }}
      </AsyncSection>
    </Card>
  );
}

export function CoachClasses() {
  const { t } = useLanguage();

  const state = useApi(ptApi.classes, []);

  return (
    <Card title={t.staffWork.classes}>
      <AsyncSection
        state={state}
        isEmpty={(rows) => !rows.length}
        emptyMessage={t.common.noData}
      >
        {(rows) => (
          <Table
            headers={[
              t.staffWork.title,
              t.staffWork.sport,
              t.staffWork.status,
              t.staffWork.actions,
            ]}
          >
            {rows.map((course) => (
              <tr key={course.classId}>
                <td>{course.name}</td>

                <td>{course.sportName}</td>

                <td>
                  <StatusChip value={course.status} />
                </td>

                <td>
                  <Link
                    className="btn btn--secondary"
                    href={`/coach/classes/${course.classId}`}
                  >
                    {t.staffWork.attendance}
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AsyncSection>
    </Card>
  );
}

export function CoachMembers() {
  return <CoachClasses />;
}

function CoachDashboard() {
  const { t } = useLanguage();

  const today = todayIso();
  const until = addDaysIso(today, 6);

  const schedule = useApi(
    (signal) => courtScheduleApi.list(today, until, "", true, signal),
    [today, until],
  );

  const rooms = useApi((signal) => catalogApi.rooms(signal), []);

  function vietnamDate(value: string) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(value));
  }

  return (
    <div className="stack">
      <AsyncSection state={schedule}>
        {(rows) => {
          const todayRows = rows.filter(
            (entry) => vietnamDate(entry.startAtUtc) === today,
          );

          return (
            <div className="stats-grid">
              <Stat
                label={t.coach.dashboard.statTodayLessons}
                value={todayRows.length}
              />

              <Stat
                label={t.coach.dashboard.statUpcomingLessons}
                value={rows.length}
              />
            </div>
          );
        }}
      </AsyncSection>

      <Card
        title={t.coach.dashboard.scheduleTableTitle}
        actions={
          <Link className="btn btn--secondary" href="/coach/schedule">
            {t.navigation.items.teachingSchedule}
          </Link>
        }
      >
        <AsyncSection
          state={schedule}
          isEmpty={(rows) => !rows.length}
          emptyMessage={t.coach.dashboard.scheduleTableEmpty}
        >
          {(rows) => (
            <AsyncSection state={rooms}>
              {(roomRows) => (
                <Table
                  headers={[
                    t.coach.dashboard.columnClass,
                    t.coach.dashboard.columnTime,
                    t.coach.dashboard.columnRoom,
                    t.coach.dashboard.columnStatus,
                    t.staffWork.actions,
                  ]}
                >
                  {rows.slice(0, 8).map((entry) => {
                    const room = roomRows.find(
                      (item) => item.roomId === entry.roomId,
                    );

                    return (
                      <tr key={`${entry.sourceType}-${entry.sourceId}`}>
                        <td>{entry.title}</td>

                        <td>{formatDateTime(entry.startAtUtc)}</td>

                        <td>{room?.name ?? "—"}</td>

                        <td>
                          <StatusChip value={entry.status} />
                        </td>

                        <td>
                          {entry.sourceType === "CLASS_SESSION" &&
                          entry.classId ? (
                            <Link
                              className="btn btn--secondary"
                              href={`/coach/classes/${entry.classId}`}
                            >
                              {t.staffWork.attendance}
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </Table>
              )}
            </AsyncSection>
          )}
        </AsyncSection>
      </Card>

      <Card title={t.staffWork.actions}>
        <div className="btn-row">
          <Link className="btn btn--secondary" href="/coach/schedule">
            {t.navigation.items.teachingSchedule}
          </Link>

          <Link className="btn btn--secondary" href="/coach/classes">
            {t.staffWork.classes}
          </Link>
        </div>
      </Card>
    </div>
  );
}

export function CoachOverview() {
  return <CoachDashboard />;
}

"use client";
import { TableFilters } from "@/components/data/TableFilters";

import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Search,
} from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { todayIso, addDaysIso, formatDate, formatTime } from "@/lib/format";
import { vietnamLocal } from "@/lib/vietnam-time";
import { Card, Dialog, Field, Table, AsyncSection } from "@/components/ui";
import type { CourtScheduleEntryDto, CourseRosterDto } from "@/lib/types";
import styles from "./AttendanceBoard.module.css";

type Filter = "ALL" | "PRESENT" | "ABSENT" | "UNMARKED";

export function AttendanceBoard({
  coachOnly,
  initialSessionId,
  initialDate,
}: {
  coachOnly: boolean;
  initialSessionId?: string | null;
  initialDate?: string | null;
  onResultRequested?: (entry: {
    enrollmentId: string;
    memberName: string;
  }) => void;
}) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const l = t.operations;
  const now = useNow();
  const [date, setDate] = useState(initialDate || todayIso());
  const [sessionId, setSession] = useState(initialSessionId || "");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const writable = user?.role === "Receptionist" && !coachOnly;

  const sessions = useApi(
    (signal) =>
      api.get<CourtScheduleEntryDto[]>(
        coachOnly
          ? "/api/coaches/me/court-schedule"
          : "/api/manager/court-schedule",
        {
          signal,
          query: {
            fromDate: date,
            toDate: date,
          },
        },
      ),
    [date, coachOnly],
  );
  const allSessions = (sessions.data ?? []).filter(
    (entry) =>
      entry.sourceType === "CLASS_SESSION" && entry.status !== "CANCELLED",
  );
  const daySessions = allSessions
    .filter((entry) => vietnamLocal(entry.startAtUtc).slice(0, 10) === date)
    .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
  const nextSessions = useApi(
    async (signal) => {
      if (
        sessions.loading ||
        sessions.error ||
        !sessions.data ||
        daySessions.length
      )
        return [];

      const path = coachOnly
        ? "/api/coaches/me/court-schedule"
        : "/api/manager/court-schedule";
      for (let offset = 1; offset <= 60; offset += 30) {
        const entries = await api.get<CourtScheduleEntryDto[]>(path, {
          signal,
          query: {
            fromDate: addDaysIso(date, offset),
            toDate: addDaysIso(date, offset + 29),
          },
        });
        const upcoming = entries
          .filter(
            (entry) =>
              entry.sourceType === "CLASS_SESSION" &&
              entry.status !== "CANCELLED",
          )
          .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
        if (upcoming.length) return upcoming;
      }
      return [];
    },
    [
      date,
      coachOnly,
      sessions.loading,
      sessions.error,
      sessions.data,
      daySessions.length,
    ],
  );
  const nextDate = nextSessions.data?.length
    ? vietnamLocal(nextSessions.data[0].startAtUtc).slice(0, 10)
    : null;
  const nextCount = nextDate
    ? nextSessions.data!.filter(
        (entry) => vietnamLocal(entry.startAtUtc).slice(0, 10) === nextDate,
      ).length
    : 0;
  const roster = useApi(
    (signal) =>
      sessionId
        ? api.get<CourseRosterDto>(`/api/class-sessions/${sessionId}/roster`, {
            signal,
          })
        : Promise.resolve(null),
    [sessionId],
  );
  function chooseDate(next: string) {
    if (!next || next === date) return;
    setDate(next);
    setSession("");
    setSearch("");
    setFilter("ALL");
    setErrors({});
  }

  async function mark(id: string, status: "PRESENT" | "ABSENT") {
    if (!writable || !sessionId) return false;
    const key = `${sessionId}-${id}`;
    setBusy((previous) => ({ ...previous, [key]: true }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
    try {
      await api.put(`/api/class-sessions/${sessionId}/attendance/${id}`, {
        status,
      });
      return true;
    } catch (error) {
      setErrors((previous) => ({
        ...previous,
        [key]: (error as Error).message,
      }));
      return false;
    } finally {
      setBusy((previous) => ({ ...previous, [key]: false }));
    }
  }

  return (
    <div className={styles.board}>
      <Card>
        <div className={styles.controls}>
          <div className={styles.dateControl}>
            <span className={styles.controlLabel}>{l.date}</span>
            <div className={styles.dateActions}>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Previous day"
                disabled={bulk}
                onClick={() => chooseDate(addDaysIso(date, -1))}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className={styles.todayButton}
                disabled={bulk}
                onClick={() => chooseDate(todayIso())}
              >
                Today
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Next day"
                disabled={bulk}
                onClick={() => chooseDate(addDaysIso(date, 1))}
              >
                <ChevronRight size={18} />
              </button>
              <span className={styles.selectedDate}>{formatDate(date)}</span>
              <label className={styles.calendarControl} title="Choose date">
                <CalendarDays size={18} aria-hidden="true" />
                <input
                  type="date"
                  aria-label="Choose date"
                  value={date}
                  disabled={bulk}
                  onChange={(event) => chooseDate(event.target.value)}
                />
              </label>
            </div>
          </div>
          <div className={styles.sessionControl}>
            <Field label="Class session">
              <select
                value={sessionId}
                disabled={bulk || sessions.loading}
                onChange={(event) => {
                  setSession(event.target.value);
                  setSearch("");
                  setFilter("ALL");
                  setErrors({});
                }}
              >
                <option value="">Select a session</option>
                {daySessions.map((entry) => (
                  <option key={entry.sourceId} value={entry.sourceId}>
                    {formatTime(entry.startAtUtc)}–{formatTime(entry.endAtUtc)}{" "}
                    · {entry.title}
                  </option>
                ))}
                {sessionId &&
                  !daySessions.some(
                    (entry) => entry.sourceId === sessionId,
                  ) && (
                    <option value={sessionId}>
                      {roster.data?.session.className ?? "Selected session"}
                    </option>
                  )}
              </select>
            </Field>
          </div>
        </div>
        {sessions.error && <p role="alert">{sessions.error.message}</p>}
        {!sessions.loading && !sessions.error && daySessions.length === 0 && (
          <div className={styles.emptyDay} role="status">
            <p>No class sessions are scheduled for {formatDate(date)}.</p>
            {nextDate && (
              <button
                type="button"
                className={styles.nextSessionButton}
                onClick={() => chooseDate(nextDate)}
              >
                Next class day: {formatDate(nextDate)} ({nextCount}{" "}
                {nextCount === 1 ? "session" : "sessions"})
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </Card>

      {!writable && <p>{l.readOnly}</p>}
      {!sessionId && daySessions.length > 0 && (
        <div className={styles.prompt}>
          Choose a class session to view its attendance board.
        </div>
      )}
      {sessionId && (
        <AsyncSection state={roster}>
          {(data) => {
            const confirmed = data.entries.filter(
              (entry) => entry.enrollmentStatus === "CONFIRMED",
            );
            const present = confirmed.filter(
              (entry) => entry.attendanceStatus === "PRESENT",
            ).length;
            const absent = confirmed.filter(
              (entry) => entry.attendanceStatus === "ABSENT",
            ).length;
            const unmarked = confirmed.length - present - absent;
            const inWindow =
              now >= new Date(data.attendanceOpensAtUtc).getTime() &&
              now <= new Date(data.attendanceClosesAtUtc).getTime();
            const upcoming =
              now < new Date(data.attendanceOpensAtUtc).getTime();
            const query = search.trim().toLowerCase();
            const searched = confirmed.filter(
              (entry) =>
                entry.memberName.toLowerCase().includes(query) ||
                entry.enrollmentId.toLowerCase().includes(query),
            );
            const rows = searched.filter(
              (entry) =>
                filter === "ALL" ||
                (filter === "UNMARKED"
                  ? !entry.attendanceStatus ||
                    entry.attendanceStatus === "NOT_RECORDED"
                  : entry.attendanceStatus === filter),
            );
            const markable = rows.filter(
              (entry) => entry.attendanceStatus !== "PRESENT",
            );
            const filters: { key: Filter; label: string; count: number }[] = [
              { key: "ALL", label: "All", count: confirmed.length },
              { key: "PRESENT", label: l.present, count: present },
              { key: "ABSENT", label: l.absent, count: absent },
              { key: "UNMARKED", label: "Unmarked", count: unmarked },
            ];
            return (
              <>
                <section
                  className={styles.summary}
                  aria-label="Session summary"
                >
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Status</span>
                    <strong
                      className={`${styles.status} ${upcoming ? styles.upcoming : inWindow ? styles.open : styles.closed}`}
                    >
                      <span aria-hidden="true">●</span>{" "}
                      {upcoming ? "Upcoming" : inWindow ? "Open" : "Closed"}
                    </strong>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>
                      {l.attendanceWindow}
                    </span>
                    <strong className={styles.summaryValue}>
                      <Clock3 size={17} aria-hidden="true" />
                      <span>
                        {formatDate(data.attendanceOpensAtUtc)}{" "}
                        {formatTime(data.attendanceOpensAtUtc)} –{" "}
                        {formatDate(data.attendanceClosesAtUtc)}{" "}
                        {formatTime(data.attendanceClosesAtUtc)}
                      </span>
                    </strong>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Progress</span>
                    <strong className={styles.summaryValue}>
                      {t.frontDesk.recorded
                        .replace("{done}", String(present + absent))
                        .replace("{total}", String(confirmed.length))}
                    </strong>
                    <progress
                      className={styles.progress}
                      value={present + absent}
                      max={confirmed.length || 1}
                      aria-label="Attendance progress"
                    />
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Coach</span>
                    <strong className={styles.summaryValue}>
                      {data.session.coachName || "—"}
                    </strong>
                  </div>
                </section>
                {writable && !inWindow && (
                  <p className={styles.windowNotice} role="status">
                    {upcoming
                      ? t.frontDesk.attendanceNotOpen
                      : t.frontDesk.attendanceClosed}
                  </p>
                )}
                <Card bodyless>
                  <div className={styles.tableToolbar}>
                    <div className={styles.searchBox}>
                      <Search size={18} aria-hidden="true" />
                      <input
                        aria-label="Search member or enrollment ID"
                        placeholder="Search member or enrollment ID"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </div>
                    <TableFilters>
                      <div
                        className={styles.filters}
                        role="group"
                        aria-label="Filter attendance"
                      >
                        {filters.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            className={`${styles.filter} ${filter === item.key ? styles.filterActive : ""}`}
                            aria-pressed={filter === item.key}
                            onClick={() => setFilter(item.key)}
                          >
                            {item.label} ({item.count})
                          </button>
                        ))}
                      </div>
                    </TableFilters>
                    {writable && (
                      <button
                        className="btn btn--secondary"
                        disabled={
                          !inWindow ||
                          bulk ||
                          !markable.length ||
                          Object.values(busy).some(Boolean)
                        }
                        onClick={() => setConfirmBulk(true)}
                      >
                        {l.markAll}
                      </button>
                    )}
                  </div>
                  <Table
                    headers={[
                      l.member,
                      "Enrollment",
                      l.status,
                      "Attendance action",
                      "Recorded at",
                    ]}
                  >
                    {rows.map((entry) => {
                      const key = `${sessionId}-${entry.enrollmentId}`;
                      return (
                        <tr key={key}>
                          <td>
                            <div className={styles.member}>
                              <UserAvatar
                                userId={entry.memberId}
                                name={entry.memberName}
                                size={36}
                              />
                              <span>
                                <strong>{entry.memberName}</strong>
                                <small title={entry.enrollmentId}>
                                  ID: {entry.enrollmentId.slice(0, 8)}
                                </small>
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={styles.confirmed}>Confirmed</span>
                          </td>
                          <td>
                            <span className={styles.attendanceState}>
                              {entry.attendanceStatus === "PRESENT"
                                ? l.present
                                : entry.attendanceStatus === "ABSENT"
                                  ? l.absent
                                  : "Unmarked"}
                            </span>
                          </td>
                          <td>
                            {writable ? (
                              <div
                                className={styles.actionGroup}
                                role="group"
                                aria-label={`Attendance for ${entry.memberName}`}
                              >
                                {(["PRESENT", "ABSENT"] as const).map(
                                  (status) => (
                                    <button
                                      key={status}
                                      type="button"
                                      className={`${styles.actionButton} ${entry.attendanceStatus === status ? (status === "PRESENT" ? styles.presentSelected : styles.absentSelected) : ""}`}
                                      aria-pressed={
                                        entry.attendanceStatus === status
                                      }
                                      disabled={!inWindow || busy[key] || bulk}
                                      onClick={async () => {
                                        if (
                                          await mark(entry.enrollmentId, status)
                                        )
                                          roster.reload();
                                      }}
                                    >
                                      {status === "PRESENT"
                                        ? l.present
                                        : l.absent}
                                    </button>
                                  ),
                                )}
                              </div>
                            ) : (
                              "—"
                            )}
                            {errors[key] && (
                              <p role="alert" className={styles.rowError}>
                                {errors[key]}
                              </p>
                            )}
                          </td>
                          <td>
                            {entry.attendanceRecordedAt
                              ? `${formatDate(entry.attendanceRecordedAt)} ${formatTime(entry.attendanceRecordedAt)}`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </Table>
                  {!rows.length && (
                    <p className={styles.noRows}>
                      {confirmed.length === 0
                        ? "No confirmed members in this session."
                        : "No members match this search or filter."}
                    </p>
                  )}
                </Card>
                {confirmBulk && (
                  <Dialog
                    title={l.confirm}
                    onClose={() => !bulk && setConfirmBulk(false)}
                  >
                    <p>
                      Mark {markable.length} displayed members present? Each
                      result is saved separately.
                    </p>
                    <button
                      className="btn"
                      disabled={bulk}
                      onClick={async () => {
                        setBulk(true);
                        for (const entry of markable)
                          await mark(entry.enrollmentId, "PRESENT");
                        setBulk(false);
                        setConfirmBulk(false);
                        roster.reload();
                      }}
                    >
                      {l.confirm}
                    </button>
                  </Dialog>
                )}
              </>
            );
          }}
        </AsyncSection>
      )}
    </div>
  );
}

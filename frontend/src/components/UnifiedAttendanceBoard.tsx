"use client";
import { useState } from "react";
import { CalendarX2, ChevronRight } from "lucide-react";
import { AsyncSection, Card } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { useApi, useNow } from "@/lib/useApi";
import { addDaysIso, formatDate, formatTime, todayIso } from "@/lib/format";
import { vietnamLocal } from "@/lib/vietnam-time";
import type { CourtScheduleEntryDto } from "@/lib/types";
import {
  AttendanceCalendar,
  monthEnd,
  monthStart,
  type AttendanceMarker,
} from "./AttendanceCalendar";
import { AttendanceRoster } from "./AttendanceRoster";
import { sessionPhase, type SessionPhase } from "./attendance-window";
import hub from "./AttendanceHub.module.css";

type PhaseFilter = "all" | SessionPhase;
const phases: { value: PhaseFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "upcoming", label: "Not open" },
  { value: "live", label: "Open" },
  { value: "editable", label: "Correction open" },
  { value: "locked", label: "Locked" },
];
const sessionDay = (entry: CourtScheduleEntryDto) =>
  vietnamLocal(entry.startAtUtc).slice(0, 10);

export function UnifiedAttendanceBoard({
  initialSessionId,
  initialDate,
}: {
  initialSessionId?: string | null;
  initialDate?: string | null;
}) {
  const { user } = useAuth();
  const now = useNow(30_000);
  const [date, setDate] = useState(initialDate || todayIso());
  const [month, setMonth] = useState(monthStart(initialDate || todayIso()));
  const [classId, setClassId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("all");
  const [sessionId, setSessionId] = useState(initialSessionId || "");
  const schedule = useApi(
    (signal) =>
      api.get<CourtScheduleEntryDto[]>("/api/manager/court-schedule", {
        signal,
        query: { fromDate: month, toDate: monthEnd(month) },
      }),
    [month],
  );
  const allSessions = (schedule.data ?? [])
    .filter(
      (entry) =>
        entry.sourceType === "CLASS_SESSION" && entry.status !== "CANCELLED",
    )
    .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
  const classes = new Map<number, string>();
  const members = new Map<string, string>();
  for (const entry of allSessions) {
    if (entry.classId != null) classes.set(entry.classId, entry.title);
    for (const person of entry.participants ?? [])
      members.set(person.memberId, person.memberName);
  }
  const filtered = allSessions.filter(
    (entry) =>
      (!classId || String(entry.classId) === classId) &&
      (!memberId ||
        entry.participants?.some((person) => person.memberId === memberId)) &&
      (phaseFilter === "all" ||
        sessionPhase(entry.startAtUtc, entry.endAtUtc, now) === phaseFilter),
  );
  const markers = new Map<string, AttendanceMarker>();
  for (const entry of filtered) {
    const day = sessionDay(entry);
    const marker = markers.get(day) ?? { count: 0, phases: [] };
    marker.count++;
    const phase = sessionPhase(entry.startAtUtc, entry.endAtUtc, now);
    if (!marker.phases.includes(phase)) marker.phases.push(phase);
    markers.set(day, marker);
  }
  const daySessions = filtered.filter((entry) => sessionDay(entry) === date);
  const nearest = [...markers.keys()]
    .filter((day) => day !== date)
    .sort(
      (a, b) =>
        Math.abs(Date.parse(a) - Date.parse(date)) -
        Math.abs(Date.parse(b) - Date.parse(date)),
    )[0];

  function chooseDate(next: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
    setDate(next);
    setSessionId("");
    if (monthStart(next) !== month) setMonth(monthStart(next));
  }

  return (
    <div className={hub.panel}>
      <div className={hub.toolbar}>
        <label>
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={(event) => chooseDate(event.target.value)}
          />
        </label>
        <label>
          <span>Class</span>
          <select
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
              setSessionId("");
            }}
          >
            <option value="">All classes</option>
            {[...classes]
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>Member</span>
          <select
            value={memberId}
            onChange={(event) => {
              setMemberId(event.target.value);
              setSessionId("");
            }}
          >
            <option value="">All members</option>
            {[...members]
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>Class status</span>
          <select
            value={phaseFilter}
            onChange={(event) => {
              setPhaseFilter(event.target.value as PhaseFilter);
              setSessionId("");
            }}
          >
            {phases.map((phase) => (
              <option key={phase.value} value={phase.value}>
                {phase.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={hub.byDate}>
        <Card>
          <AttendanceCalendar
            value={date}
            month={month}
            markers={markers}
            onSelect={chooseDate}
            onMonthChange={(next) => {
              setMonth(next);
              setDate(next);
              setSessionId("");
            }}
          />
          <div className={hub.quickDates}>
            <button type="button" onClick={() => chooseDate(todayIso())}>
              Today
            </button>
            <button
              type="button"
              onClick={() => chooseDate(addDaysIso(date, -1))}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => chooseDate(addDaysIso(date, 1))}
            >
              Tomorrow
            </button>
          </div>
        </Card>
        <div className={hub.sessionColumn}>
          {sessionId ? (
            <AttendanceRoster
              key={sessionId}
              sessionId={sessionId}
              writable={user?.role === "Receptionist"}
              onBack={() => {
                setSessionId("");
                schedule.reload();
              }}
            />
          ) : (
            <>
              <h2 className={hub.sectionTitle}>
                Class schedule · {formatDate(date)}
              </h2>
              <AsyncSection state={schedule}>
                {() =>
                  daySessions.length === 0 ? (
                    <div className={hub.empty} role="status">
                      <CalendarX2 size={28} aria-hidden="true" />
                      <p>No classes match the filters on {formatDate(date)}.</p>
                      {nearest && (
                        <button
                          type="button"
                          className={hub.linkButton}
                          onClick={() => chooseDate(nearest)}
                        >
                          Nearest class day: {formatDate(nearest)} (
                          {markers.get(nearest)?.count} sessions)
                          <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <ul className={hub.cards}>
                      {daySessions.map((entry) => {
                        const enrolled = (entry.participants ?? []).filter(
                          (person) => person.enrollmentId,
                        );
                        const marked = enrolled.filter((person) =>
                          ["PRESENT", "ABSENT"].includes(
                            person.attendanceStatus ?? "",
                          ),
                        ).length;
                        const phase = sessionPhase(
                          entry.startAtUtc,
                          entry.endAtUtc,
                          now,
                        );
                        return (
                          <li key={entry.sourceId}>
                            <button
                              type="button"
                              className={hub.card}
                              onClick={() => setSessionId(entry.sourceId)}
                            >
                              <span className={hub.cardTime}>
                                {formatTime(entry.startAtUtc)}–
                                {formatTime(entry.endAtUtc)}
                              </span>
                              <strong className={hub.cardTitle}>
                                {entry.title}
                              </strong>
                              <span className={hub.muted}>
                                Coach: {entry.coachName || "—"}
                              </span>
                              <span
                                className={`${hub.phaseBadge} ${hub[`phase_${phase}`]}`}
                              >
                                {
                                  phases.find((item) => item.value === phase)
                                    ?.label
                                }
                              </span>
                              <span className={hub.cardProgress}>
                                <progress
                                  value={marked}
                                  max={enrolled.length || 1}
                                  aria-label="Attendance progress"
                                />
                                <span>
                                  Attendance:{" "}
                                  {enrolled.length > 0 &&
                                  marked === enrolled.length
                                    ? "Completed"
                                    : "Pending"}{" "}
                                  · {marked}/{enrolled.length} marked
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )
                }
              </AsyncSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

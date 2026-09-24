"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, EmptyState, Modal } from "@/shared/ui";
import {
  addDays,
  dayKey,
  dateLabel,
  monday,
  timeLabel,
} from "@/shared/lib/date";
import { useCurrentTime } from "@/shared/lib/clock";
import {
  bookingProblem,
  type BookingFilter,
  type ClassSession,
  type Enrollment,
} from "./model";

export interface BookingPackage {
  id: string;
  name: string;
  expiresAt: string;
  remainingSessions: number | null;
  status: string;
}
export interface CalendarProps {
  sessions: ClassSession[];
  enrollments: Enrollment[];
  packages: BookingPackage[];
  busy: boolean;
  initialCoach?: string;
  onBook: (sessionId: string, packageId: string) => Promise<boolean>;
  onCancel: (sessionId: string) => Promise<boolean>;
}
export function MemberCalendar({
  sessions,
  enrollments,
  packages,
  busy,
  initialCoach = "",
  onBook,
  onCancel,
}: CalendarProps) {
  const currentTime = useCurrentTime();
  const [filter, setFilter] = useState<BookingFilter>("all");
  const [week, setWeek] = useState(() => monday(dayKey()));
  const [coach, setCoach] = useState(initialCoach);
  const [selected, setSelected] = useState<ClassSession | null>(null);
  const [packageId, setPackageId] = useState("");
  const [query, setQuery] = useState("");
  const [modalError, setModalError] = useState("");
  const confirmed = (id: string) =>
    enrollments.some((e) => e.sessionId === id && e.status === "Confirmed");
  const shown = sessions.filter(
    (s) =>
      s.status === "Scheduled" &&
      (!coach || s.coachId === coach) &&
      `${s.name} ${s.discipline}`
        .toLocaleLowerCase("vi")
        .includes(query.toLocaleLowerCase("vi")) &&
      (filter === "all" ||
        (filter === "booked" ? confirmed(s.id) : !confirmed(s.id))),
  );
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const availablePackages = selected
    ? packages.filter(
        (p) =>
          p.status === "Active" &&
          Date.parse(p.expiresAt) >= Date.parse(selected.startAt) &&
          p.remainingSessions !== 0,
      )
    : [];
  const isCancel = selected && confirmed(selected.id);
  function open(session: ClassSession) {
    setSelected(session);
    setModalError("");
    setPackageId(
      packages.find(
        (p) =>
          p.status === "Active" &&
          p.remainingSessions !== 0 &&
          Date.parse(p.expiresAt) >= Date.parse(session.startAt),
      )?.id ?? "",
    );
  }
  return (
    <div className="stack">
      <h1>Practice Calendar</h1>
      <div className="filters" role="group" aria-label="Reschedule">
        {(
          [
            ["all", "All"],
            ["available", "Not registered"],
            ["booked", "Hold the seat."],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={filter === value ? "primary" : "secondary"}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="calendar-tools">
        <label className="field">
          Find Class
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Class Names or Department"
            type="search"
          />
        </label>
        <label className="field">
          Coach
          <select value={coach} onChange={(e) => setCoach(e.target.value)}>
            <option value="">All Coaches.</option>
            {Array.from(
              new Map(sessions.map((s) => [s.coachId, s.coachName])),
            ).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row between wrap">
        <h2>
          {new Intl.DateTimeFormat("vi-VN", {
            month: "long",
            year: "numeric",
          }).format(new Date(`${week}T12:00:00+07:00`))}
        </h2>
        <div className="row">
          <Button
            variant="quiet"
            aria-label="Seven days ago."
            onClick={() => setWeek(addDays(week, -7))}
          >
            ←
          </Button>
          <Button variant="quiet" onClick={() => setWeek(monday(dayKey()))}>
            Today
          </Button>
          <Button
            variant="quiet"
            aria-label="The next seven days."
            onClick={() => setWeek(addDays(week, 7))}
          >
            →
          </Button>
        </div>
      </div>
      <p className="sr-only" role="status">
        {shown.filter((s) => days.includes(dayKey(new Date(s.startAt)))).length}{" "}
        word match level {dateLabel(week)} To {dateLabel(days[6])}.
      </p>
      <div className="calendar-grid">
        {days.map((day) => {
          const items = shown
            .filter((s) => dayKey(new Date(s.startAt)) === day)
            .sort((a, b) => a.startAt.localeCompare(b.startAt));
          return (
            <section
              key={day}
              className={`calendar-day ${items.length ? "" : "day-empty"}`}
              aria-label={`Class on ${dateLabel(day)}`}
            >
              <header className="day-heading">
                <span>
                  {new Intl.DateTimeFormat("vi-VN", {
                    weekday: "short",
                  }).format(new Date(`${day}T12:00:00+07:00`))}
                </span>
                <strong>{Number(day.slice(-2))}</strong>
              </header>
              {items.map((session) => {
                const booked = confirmed(session.id);
                const problem = bookingProblem(
                  session,
                  sessions,
                  enrollments,
                  currentTime,
                );
                return (
                  <article
                    className={`class-event ${booked ? "booked" : ""}`}
                    key={session.id}
                  >
                    <time>
                      {timeLabel(session.startAt)}–{timeLabel(session.endAt)}
                    </time>
                    <h3>{session.name}</h3>
                    <p className="muted">
                      {session.coachName}
                      <br />
                      {session.room}
                    </p>
                    <span className="event-state">
                      {booked
                        ? "The place is in place."
                        : session.confirmedCount >= session.capacity
                          ? "Full room."
                          : `Remaining: ${session.capacity - session.confirmedCount} spots`}
                    </span>
                    <Button
                      variant={booked ? "quiet" : "primary"}
                      disabled={
                        busy ||
                        (booked
                          ? Date.parse(session.startAt) <= currentTime
                          : !!problem)
                      }
                      title={!booked && problem ? problem : undefined}
                      aria-label={`${booked ? "View Register" : "Schedule"} ${session.name}`}
                      onClick={() => open(session)}
                    >
                      {booked ? "View Register" : "Schedule"}
                    </Button>
                    {!booked && problem && <small>{problem}</small>}
                  </article>
                );
              })}
              {!items.length && (
                <span className="muted no-class">No Class</span>
              )}
            </section>
          );
        })}
      </div>
      {!shown.some((s) => days.includes(dayKey(new Date(s.startAt)))) && (
        <EmptyState title="No fit">
          Try changing the filter or viewing the following days.
        </EmptyState>
      )}
      {selected && (
        <Modal
          title={isCancel ? "Register Information" : "Set training schedule"}
          onClose={() => setSelected(null)}
        >
          <div className="stack">
            <h3>{selected.name}</h3>
            <p>
              {dateLabel(selected.startAt)} · {timeLabel(selected.startAt)}–
              {timeLabel(selected.endAt)}
              <br />
              {selected.coachName} · {selected.room}
            </p>
            {isCancel ? (
              <Card className="subtle">
                <p>
                  Cancel:{" "}
                  <strong>
                    {dateLabel(selected.cancellationDeadline)} ·{" "}
                    {timeLabel(selected.cancellationDeadline)}
                  </strong>
                </p>
                <p>
                  {currentTime <= Date.parse(selected.cancellationDeadline)
                    ? "Cancel on time: The episode is completed to the used package."
                    : "Canceled timeout: you will not be completed."}
                </p>
              </Card>
            ) : availablePackages.length ? (
              <label className="field">
                Use Package
                <select
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                >
                  {availablePackages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ·{" "}
                      {p.remainingSessions === null
                        ? "No Limit"
                        : `${p.remainingSessions} sessions remaining`}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p>
                You need the package to be in effect and you need the exercise.{" "}
                <Link href="/member/packages">View membership packages</Link>
              </p>
            )}
            {modalError && <p role="alert">{modalError}</p>}
            <div className="row wrap">
              <Button variant="secondary" onClick={() => setSelected(null)}>
                {isCancel ? "Hold your seat." : "Later."}
              </Button>
              <Button
                disabled={busy || (!isCancel && !packageId)}
                onClick={async () => {
                  const ok = isCancel
                    ? await onCancel(selected.id)
                    : await onBook(selected.id, packageId);
                  if (ok) setSelected(null);
                  else
                    setModalError(
                      "Operation not completed. Check the package status and class status, and try again.",
                    );
                }}
              >
                {busy
                  ? "Processing..."
                  : isCancel
                    ? "Confirm Abortion"
                    : "Schedule"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

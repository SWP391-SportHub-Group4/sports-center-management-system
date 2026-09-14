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
      <h1>Lịch tập luyện</h1>
      <div className="filters" role="group" aria-label="Lọc trạng thái đăng ký">
        {(
          [
            ["all", "Tất cả"],
            ["available", "Chưa đăng ký"],
            ["booked", "Đã giữ chỗ"],
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
          Tìm lớp
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tên lớp hoặc bộ môn"
            type="search"
          />
        </label>
        <label className="field">
          Huấn luyện viên
          <select value={coach} onChange={(e) => setCoach(e.target.value)}>
            <option value="">Tất cả HLV</option>
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
            aria-label="7 ngày trước"
            onClick={() => setWeek(addDays(week, -7))}
          >
            ←
          </Button>
          <Button variant="quiet" onClick={() => setWeek(monday(dayKey()))}>
            Hôm nay
          </Button>
          <Button
            variant="quiet"
            aria-label="7 ngày tiếp theo"
            onClick={() => setWeek(addDays(week, 7))}
          >
            →
          </Button>
        </div>
      </div>
      <p className="sr-only" role="status">
        {shown.filter((s) => days.includes(dayKey(new Date(s.startAt)))).length}{" "}
        lớp phù hợp từ {dateLabel(week)} đến {dateLabel(days[6])}.
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
              aria-label={`Lớp ngày ${dateLabel(day)}`}
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
                  Date.now(),
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
                        ? "✓ Đã giữ chỗ"
                        : session.confirmedCount >= session.capacity
                          ? "Hết chỗ"
                          : `Còn ${session.capacity - session.confirmedCount} chỗ`}
                    </span>
                    <Button
                      variant={booked ? "quiet" : "primary"}
                      disabled={
                        busy ||
                        (booked
                          ? Date.parse(session.startAt) <= Date.now()
                          : !!problem)
                      }
                      title={!booked && problem ? problem : undefined}
                      aria-label={`${booked ? "Xem đăng ký" : "Đặt lịch"} ${session.name}`}
                      onClick={() => open(session)}
                    >
                      {booked ? "Xem đăng ký" : "Đặt lịch"}
                    </Button>
                    {!booked && problem && <small>{problem}</small>}
                  </article>
                );
              })}
              {!items.length && (
                <span className="muted no-class">Không có lớp</span>
              )}
            </section>
          );
        })}
      </div>
      {!shown.some((s) => days.includes(dayKey(new Date(s.startAt)))) && (
        <EmptyState title="Chưa có lớp phù hợp">
          Thử đổi bộ lọc hoặc xem những ngày tiếp theo.
        </EmptyState>
      )}
      {selected && (
        <Modal
          title={isCancel ? "Thông tin đăng ký" : "Đặt lịch tập luyện"}
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
                  Hạn hủy:{" "}
                  <strong>
                    {dateLabel(selected.cancellationDeadline)} ·{" "}
                    {timeLabel(selected.cancellationDeadline)}
                  </strong>
                </p>
                <p>
                  {Date.now() <= Date.parse(selected.cancellationDeadline)
                    ? "Hủy đúng hạn: lượt tập được hoàn vào gói đã sử dụng."
                    : "Đã qua hạn hủy: bạn sẽ không được hoàn lượt tập."}
                </p>
              </Card>
            ) : availablePackages.length ? (
              <label className="field">
                Gói sử dụng
                <select
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                >
                  {availablePackages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ·{" "}
                      {p.remainingSessions === null
                        ? "Không giới hạn"
                        : `${p.remainingSessions} lượt còn lại`}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p>
                Bạn cần gói còn hiệu lực và còn lượt tập.{" "}
                <Link href="/member/packages">Xem gói hội viên</Link>
              </p>
            )}
            {modalError && <p role="alert">{modalError}</p>}
            <div className="row wrap">
              <Button variant="secondary" onClick={() => setSelected(null)}>
                {isCancel ? "Giữ chỗ" : "Để sau"}
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
                      "Thao tác chưa hoàn tất. Kiểm tra trạng thái gói và lớp, rồi thử lại.",
                    );
                }}
              >
                {busy
                  ? "Đang xử lý…"
                  : isCancel
                    ? "Xác nhận hủy"
                    : "Xác nhận đặt lịch"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

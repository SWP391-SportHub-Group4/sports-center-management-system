"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ScheduleCoursePage } from "./schedule-course-page";
import { ScheduleRentalPage } from "./schedule-rental-page";
import {
  BookOpen,
  MapPin,
  UserRound,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { MemberMonthCalendar } from "./month-calendar";
import { CalendarSticker } from "./calendar-sticker";
import { CourseSticker } from "@/features/courses";
import { Drawer } from "@/components/primitives";
import { AsyncSection, StatusChip } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { addDaysIso, formatDate, formatTime, todayIso } from "@/lib/format";
import { useUrlQuery } from "@/lib/useUrlQuery";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { rentalApi } from "../rentals/api";
import type { CourtRentalDto, SportDto, CourseSessionDto } from "@/lib/types";
import { memberSchedule, type MemberEvent } from "./api";
import { eventKind, sportTone, type EventKind } from "./event-meta";
import { googleCalendarHref } from "./google-calendar";
import { RentalCancelConfirm } from "./rental-cancel";
import tags from "./tags.module.css";
import styles from "./schedule.module.css";

type Item = MemberEvent & {
  kind: EventKind;
  refId: string;
  sport: string | null;
  rental?: CourtRentalDto;
  preview?: boolean;
};

const ROUTINE = new Set(["scheduled", "confirmed", "active"]);
const exceptional = (status?: string | null) =>
  !!status && !ROUTINE.has(status.replace(/_/g, "").toLowerCase());

function scheduleDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return todayIso();
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : todayIso();
}

function weekMonday(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDaysIso(date, -((day + 6) % 7));
}

const vnDay = (utc: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(utc),
  );

/** Lớp nhóm + PT (API sẵn có) hợp với lượt thuê sân thành một dòng thời gian của Member. */
async function loadTimeline(
  date: string,
  days: number,
  signal: AbortSignal,
  ptSport: string,
  ptTitle: string,
  rentalTitle: string,
): Promise<Item[]> {
  // Rental reads allow at most 31 days; a month grid includes 35 or 42 days.
  const rentalRanges = Array.from({ length: Math.ceil(days / 31) }, (_, i) => ({
    fromUtc: new Date(
      `${addDaysIso(date, i * 31)}T00:00:00+07:00`,
    ).toISOString(),
    toUtc: new Date(
      `${addDaysIso(date, Math.min(days, (i + 1) * 31))}T00:00:00+07:00`,
    ).toISOString(),
  }));
  const [base, rentals, sports] = await Promise.all([
    memberSchedule(date, days, signal),
    Promise.all(
      rentalRanges.map((range) =>
        rentalApi.mine(range.fromUtc, range.toUtc, signal),
      ),
    ).then((batches) => [
      ...new Map(
        batches.flat().map((rental) => [rental.courtRentalId, rental]),
      ).values(),
    ]),
    api
      .get<SportDto[]>("/api/sports", {
        anonymous: true,
        signal,
        query: { service: "COURT_RENTAL" },
      })
      .catch(() => [] as SportDto[]),
  ]);
  const items: Item[] = base.map((e) => {
    const kind = eventKind(e.type);
    return {
      ...e,
      kind,
      refId: e.id.split(":")[1] ?? e.id,
      sport: kind === "pt" ? ptSport : (e.sportName ?? null),
      title: kind === "pt" ? ptTitle : e.title,
    };
  });
  for (const r of rentals.filter((x) => x.status !== "PENDING_PAYMENT")) {
    items.push({
      id: `rental:${r.courtRentalId}`,
      refId: r.courtRentalId,
      kind: "rental",
      type: "COURT_RENTAL",
      title: rentalTitle,
      startAtUtc: r.startAtUtc,
      endAtUtc: r.endAtUtc,
      roomName: null,
      coachName: null,
      status: r.status,
      sport: sports.find((s) => s.sportId === r.sportId)?.name ?? null,
      rental: r,
    });
  }
  return items.sort(
    (a, b) =>
      a.startAtUtc.localeCompare(b.startAtUtc) ||
      a.endAtUtc.localeCompare(b.endAtUtc) ||
      a.id.localeCompare(b.id),
  );
}

type PreviewCourse = {
  classId: number;
  name: string;
  sportName: string;
  startDate?: string;
  sessions: CourseSessionDto[];
};

export function MemberSchedule({
  previewCourse,
  initialDate,
  compact = false,
}: {
  previewCourse?: PreviewCourse;
  initialDate?: string;
  compact?: boolean;
} = {}) {
  const { t, language } = useLanguage();
  const m = t.mSchedule;
  const vi = language === "vi";
  const { values, setValues } = useUrlQuery(
    {
      date: initialDate ? scheduleDate(initialDate) : todayIso(),
      event: "",
      course: "",
      rental: "",
    },
    {
      date: scheduleDate,
      course: (value) =>
        /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
          ? value
          : "",
      rental: (value) =>
        /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
          ? value
          : "",
    },
  );
  const date = values.date;
  const month = date.slice(0, 7);
  const monthStart = `${month}-01`;
  const nextMonth = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1),
  )
    .toISOString()
    .slice(0, 10);
  const monday = weekMonday(compact ? date : monthStart);
  const monthDays = Math.round(
    (Date.parse(nextMonth) - Date.parse(monday)) / 86400000,
  );
  const days = compact ? 7 : Math.ceil(monthDays / 7) * 7;
  const [selection, setSelection] = useState<Item | null>(null);
  const [compactCourse, setCompactCourse] = useState<Item | null>(null);
  const [compactRental, setCompactRental] = useState<string | null>(null);
  const calendarScroll = useRef(0);
  const [cancelling, setCancelling] = useState<CourtRentalDto | null>(null);
  const now = useNow();
  const narrow = useMediaQuery("(max-width: 720px)");
  function setSelected(item: Item | null) {
    setSelection(item);
    if (values.event) setValues({ event: "" });
  }
  const kindLabel: Record<EventKind, string> = {
    class: m.kindClass,
    pt: m.kindPt,
    rental: m.kindRental,
  };
  const state = useApi(
    (signal) =>
      loadTimeline(monday, days, signal, "Gym", m.kindPt, m.rentalTitle),
    [monday, days, m.kindPt, m.rentalTitle],
  );

  // Preview rows are local only; they never become registrations or exportable events.
  const previews: Item[] = (previewCourse?.sessions ?? [])
    .filter((session) => {
      const day = vnDay(session.startAtUtc);
      return (
        day >= monday &&
        day < addDaysIso(monday, days) &&
        !/CANCEL/i.test(session.status)
      );
    })
    .filter(
      (session) =>
        !state.data?.some(
          (item) =>
            item.id === `class:${session.sessionId}` ||
            (item.kind === "class" &&
              item.classId === session.classId &&
              item.startAtUtc === session.startAtUtc),
        ),
    )
    .map((session) => ({
      ...session,
      id: `preview:${session.sessionId}`,
      refId: String(session.sessionId),
      title: previewCourse!.name,
      type: "CLASS_SESSION",
      kind: "class",
      sport: previewCourse!.sportName,
      preview: true,
    }));
  const timeline = [...(state.data ?? []), ...previews].sort(
    (a, b) =>
      a.startAtUtc.localeCompare(b.startAtUtc) || a.id.localeCompare(b.id),
  );
  const previewLabel = vi
    ? "Dự kiến · Chưa đăng ký"
    : "Preview · Not registered";
  const locale = vi ? "vi-VN" : "en-GB";
  const selected = values.event
    ? (timeline.find((item) => item.id === values.event) ?? null)
    : selection;
  const fmt = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  const last = addDaysIso(monday, 6);
  const range = m.rangeWeek
    .replace("{from}", fmt(monday, { day: "2-digit", month: "2-digit" }))
    .replace("{to}", fmt(last, { day: "2-digit", month: "2-digit" }));
  function moveMonth(offset: number) {
    const target = new Date(
      Date.UTC(
        Number(month.slice(0, 4)),
        Number(month.slice(5, 7)) - 1 + offset,
        1,
      ),
    );
    setSelection(null);
    setValues({ date: target.toISOString().slice(0, 10), event: "" });
  }

  const renderEvent = (item: Item) => {
    const cancelled = /CANCEL/i.test(item.status ?? "");
    const absent = item.attendanceStatus?.toUpperCase() === "ABSENT";
    // Một nhãn duy nhất cho buổi đã diễn ra: buổi lớp có mặt, buổi PT hoặc lượt thuê đã xong đều là "Hoàn thành".
    const done =
      !absent &&
      (item.attendanceStatus?.toUpperCase() === "PRESENT" ||
        item.status?.toUpperCase() === "COMPLETED");
    return (
      <button
        key={item.id}
        type="button"
        className={styles.event}
        data-preview={
          item.preview ? "true" : previewCourse ? "false" : undefined
        }
        data-state={cancelled ? "cancelled" : undefined}
        onClick={() => setSelected(item)}
      >
        <span className={styles.eventHeading}>
          <CalendarSticker sport={item.sport} kind={item.kind} />
          <strong>{item.title}</strong>
          {previewCourse && (
            <span
              className={
                item.preview ? styles.previewLabel : styles.registeredLabel
              }
            >
              {item.preview
                ? previewLabel
                : cancelled
                  ? vi
                    ? "Đã hủy"
                    : "Cancelled"
                  : item.kind === "rental"
                    ? vi
                      ? "Sân đã đặt"
                      : "Booked court"
                    : item.kind === "pt"
                      ? vi
                        ? "PT đã đặt"
                        : "Booked PT"
                      : vi
                        ? "Đã đăng ký"
                        : "Registered"}
            </span>
          )}
        </span>
        <time dateTime={item.startAtUtc}>
          {formatTime(item.startAtUtc)}–{formatTime(item.endAtUtc)}
        </time>
        {item.roomName && <span className={styles.meta}>{item.roomName}</span>}
        {item.kind === "rental" && item.sport && (
          <span className={styles.meta}>{item.sport}</span>
        )}
        {item.coachName && (
          <span className={styles.meta}>{item.coachName}</span>
        )}
        {done && (
          <StatusChip value="COMPLETED" tone="success" label={m.completed} />
        )}
        {absent && <StatusChip value="ABSENT" tone="danger" label={m.absent} />}
        {exceptional(item.status) && !done && !absent && (
          <StatusChip value={item.status} />
        )}
      </button>
    );
  };

  function returnToCalendar() {
    setSelection(null);
    setCompactCourse(null);
    setCompactRental(null);
    if (!compact) setValues({ course: "", rental: "", event: "" });
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLInputElement>(
          'input[type="month"], #member-schedule-date',
        )
        ?.focus({ preventScroll: true });
      window.scrollTo({ top: calendarScroll.current, behavior: "instant" });
    });
  }
  const activeRental = compact ? compactRental : values.rental;
  const activeCourse = compact ? compactCourse?.classId : Number(values.course);
  const courseEvent = compact
    ? (compactCourse ?? undefined)
    : selected?.classId === activeCourse
      ? (selected ?? undefined)
      : undefined;
  if (activeRental)
    return (
      <ScheduleRentalPage
        key={activeRental}
        rentalId={activeRental}
        onBack={returnToCalendar}
        onChanged={state.reload}
      />
    );
  if (activeCourse)
    return (
      <ScheduleCoursePage
        key={activeCourse}
        classId={activeCourse}
        event={courseEvent}
        onBack={returnToCalendar}
      />
    );

  return (
    <div className={compact ? styles.compact : styles.scheduleSurface}>
      {!compact ? (
        <div className={styles.monthToolbar}>
          <div className={styles.monthControls}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => {
                setSelection(null);
                setValues({ date: todayIso(), event: "" });
              }}
            >
              {vi ? "Hôm nay" : "Today"}
            </button>
            <button
              type="button"
              className={styles.monthArrow}
              aria-label={vi ? "Tháng trước" : "Previous month"}
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              className={styles.monthArrow}
              aria-label={vi ? "Tháng sau" : "Next month"}
              onClick={() => moveMonth(1)}
            >
              <ChevronRight size={20} />
            </button>
            <h2 aria-live="polite">
              {fmt(monthStart, { month: "long", year: "numeric" })}
            </h2>
          </div>
          <label className={styles.monthPicker}>
            <span className="sr-only">
              {vi ? "Chọn tháng" : "Choose month"}
            </span>
            <input
              type="month"
              value={month}
              onChange={(e) => {
                if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                  setSelection(null);
                  setValues({ date: `${e.target.value}-01`, event: "" });
                }
              }}
            />
          </label>
        </div>
      ) : (
        <div className={styles.toolbar}>
          <div className={styles.weekPicker}>
            <label htmlFor="member-schedule-date">
              {vi ? "Chọn ngày để xem lịch" : "Choose a date to view"}
            </label>
            <input
              id="member-schedule-date"
              type="date"
              value={date}
              onChange={(event) => {
                if (event.target.value)
                  setValues({ date: scheduleDate(event.target.value) });
              }}
            />
          </div>
          <div className={styles.nav}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setValues({ date: addDaysIso(monday, -7) })}
            >
              ← {m.prevWeek}
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setValues({ date: todayIso() })}
            >
              {m.currentWeek}
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setValues({ date: addDaysIso(monday, 7) })}
            >
              {m.nextWeek} →
            </button>
            {previewCourse?.startDate && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() =>
                  setValues({ date: scheduleDate(previewCourse.startDate!) })
                }
              >
                {vi ? "Tuần khai giảng" : "Course start week"}
              </button>
            )}
          </div>
        </div>
      )}

      {previewCourse && (
        <div
          className={styles.legend}
          aria-label={vi ? "Chú thích lịch" : "Schedule legend"}
        >
          <span>
            <i />
            <BookOpen size={14} aria-hidden="true" />
            {vi ? "Lớp đã đăng ký" : "Registered classes"}
          </span>
          <span>
            <MapPin size={14} aria-hidden="true" />
            {vi ? "Sân đã đặt" : "Booked courts"}
          </span>
          <span>
            <UserRound size={14} aria-hidden="true" />
            {vi ? "Lịch PT" : "PT sessions"}
          </span>
          <span>
            <i data-preview="true" />
            {previewLabel}
          </span>
        </div>
      )}
      <AsyncSection state={state}>
        {() => {
          const all = timeline;
          const byDay = new Map<string, Item[]>();
          for (let i = 0; i < days; i++) byDay.set(addDaysIso(monday, i), []);
          for (const item of all) byDay.get(vnDay(item.startAtUtc))?.push(item);
          const columns = [...byDay.entries()];
          if (!compact)
            return (
              <MemberMonthCalendar
                key={month}
                month={month}
                columns={columns}
                weekdays={m.weekdays}
                kindLabels={kindLabel}
                onSelect={setSelected}
                renderEvent={renderEvent}
              />
            );
          const rows = Math.max(
            1,
            ...columns.map(([, events]) => events.length),
          );
          if (narrow)
            return (
              <section
                className={styles.agendaList}
                aria-label={m.weekSchedule}
              >
                <h2 className={styles.agendaRange}>{range}</h2>
                {columns.map(([day, events], index) => (
                  <section
                    key={day}
                    className={styles.agendaDay}
                    data-today={day === todayIso()}
                    aria-current={day === todayIso() ? "date" : undefined}
                    aria-label={`${m.weekdays[index]} ${fmt(day, { day: "2-digit", month: "2-digit" })}`}
                  >
                    <h3>
                      {m.weekdays[index]},{" "}
                      {fmt(day, { day: "2-digit", month: "2-digit" })}
                      {day === todayIso() && (
                        <span className={styles.todayTag}>{m.todayTag}</span>
                      )}
                    </h3>
                    {events.length ? (
                      <ul>
                        {events.map((event) => (
                          <li key={event.id}>{renderEvent(event)}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.free}>{m.dayEmpty}</p>
                    )}
                  </section>
                ))}
              </section>
            );
          return (
            <div
              className={styles.calendarScroll}
              tabIndex={0}
              role="region"
              aria-label={m.weekSchedule}
            >
              <table className={styles.week}>
                <caption>{range}</caption>
                <thead>
                  <tr>
                    {columns.map(([day], index) => (
                      <th
                        key={day}
                        scope="col"
                        data-today={day === todayIso()}
                        aria-current={day === todayIso() ? "date" : undefined}
                      >
                        {m.weekdays[index]} (
                        {fmt(day, { day: "2-digit", month: "2-digit" })})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rows }, (_, row) => (
                    <tr key={row}>
                      {columns.map(([day, events]) => (
                        <td key={day} data-today={day === todayIso()}>
                          {events[row] ? (
                            renderEvent(events[row])
                          ) : (
                            <span className={styles.free}>–</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </AsyncSection>

      {selected && (
        <Drawer
          title={selected.title}
          onClose={() => setSelected(null)}
          size="md"
        >
          <div className={styles.detail}>
            <p className={styles.eventTags}>
              {selected.sport && (
                <span
                  className={tags.sport}
                  data-sport={sportTone(selected.sport)}
                >
                  {selected.sport}
                </span>
              )}
              <span className={tags.kind}>{kindLabel[selected.kind]}</span>
            </p>
            <dl>
              <dt>{m.when}</dt>
              <dd>
                {formatDate(selected.startAtUtc)} ·{" "}
                {formatTime(selected.startAtUtc)} –{" "}
                {formatTime(selected.endAtUtc)}
              </dd>
              {selected.kind !== "rental" && (
                <>
                  <dt>{m.room}</dt>
                  <dd>{selected.roomName || m.roomTbc}</dd>
                </>
              )}
              {selected.coachName && (
                <>
                  <dt>{m.coach}</dt>
                  <dd>{selected.coachName}</dd>
                </>
              )}
              <dt>{m.status}</dt>
              <dd>
                {selected.preview ? (
                  <span className={styles.previewLabel}>{previewLabel}</span>
                ) : selected.kind === "rental" &&
                  selected.status === "CONFIRMED" ? (
                  <StatusChip
                    tone="success"
                    label={m.rentalBooked}
                    value={selected.status}
                  />
                ) : (
                  <StatusChip value={selected.status} />
                )}
              </dd>
              {selected.kind === "class" && selected.attendanceStatus && (
                <>
                  <dt>{m.attendance}</dt>
                  <dd>
                    <StatusChip value={selected.attendanceStatus} />
                  </dd>
                </>
              )}
            </dl>
            {selected.isMakeup && <p>{m.makeup}</p>}
            {selected.preview && (
              <p className={styles.hint}>
                {vi
                  ? "Đây là lịch dự kiến của khóa đang xem, chưa được thêm vào lịch đã đăng ký của bạn."
                  : "These are proposed sessions for this course, not a confirmed booking."}
              </p>
            )}
            <div className={styles.actions}>
              {selected.preview ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setSelected(null);
                    requestAnimationFrame(() => {
                      const enrollment =
                        document.getElementById("course-enrollment");
                      enrollment?.focus({ preventScroll: true });
                      enrollment?.scrollIntoView({ block: "start" });
                    });
                  }}
                >
                  {vi ? "Đến phần đăng ký" : "Go to registration"}
                </button>
              ) : (
                <>
                  {selected.kind === "class" ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={!selected.classId}
                      onClick={() => {
                        calendarScroll.current = window.scrollY;
                        if (compact) {
                          setCompactCourse(selected);
                          setSelected(null);
                          return;
                        }
                        setSelection(null);
                        setValues({
                          course: String(selected.classId),
                          rental: "",
                          event: selected.id,
                        });
                      }}
                    >
                      {m.openClass}
                    </button>
                  ) : selected.kind === "rental" ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        calendarScroll.current = window.scrollY;
                        if (compact) {
                          setCompactRental(selected.refId);
                          setSelected(null);
                          return;
                        }
                        setSelection(null);
                        setValues({
                          rental: selected.refId,
                          course: "",
                          event: "",
                        });
                      }}
                    >
                      {m.openRental}
                    </button>
                  ) : (
                    <Link
                      className="btn"
                      href={`/member/training?session=${selected.refId}`}
                    >
                      {m.openPt}
                    </Link>
                  )}
                  {!/CANCEL/i.test(selected.status ?? "") && (
                    <a
                      className="btn btn--secondary"
                      target="_blank"
                      rel="noopener noreferrer"
                      href={googleCalendarHref({
                        title:
                          selected.kind === "rental" && selected.sport
                            ? `${selected.title} · ${selected.sport}`
                            : selected.title,
                        startAtUtc: selected.startAtUtc,
                        endAtUtc: selected.endAtUtc,
                        location: selected.roomName,
                        description: [selected.sport, selected.coachName]
                          .filter(Boolean)
                          .join(" · "),
                      })}
                    >
                      {m.addToCalendar}
                    </a>
                  )}
                  {selected.rental?.status === "CONFIRMED" &&
                    new Date(selected.startAtUtc).getTime() > now && (
                      <button
                        type="button"
                        className={`btn btn--secondary ${styles.cancel}`}
                        onClick={() => setCancelling(selected.rental ?? null)}
                      >
                        {m.cancelRental}
                      </button>
                    )}
                </>
              )}
            </div>
            {selected.kind === "pt" && (
              <p className={styles.hint}>{m.ptHint}</p>
            )}
            <div className={styles.drawerSticker} aria-hidden="true">
              <CourseSticker
                sport={
                  selected.sport ||
                  (selected.kind === "pt" ? "Gym" : kindLabel[selected.kind])
                }
              />
            </div>
          </div>
        </Drawer>
      )}
      {cancelling && (
        <RentalCancelConfirm
          rental={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={() => {
            setCancelling(null);
            setSelected(null);
            state.reload();
          }}
        />
      )}
    </div>
  );
}

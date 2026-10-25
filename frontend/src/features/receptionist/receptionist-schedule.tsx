"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button, Drawer } from "@/components/primitives";
import { Card, Field } from "@/components/ui";
import { Calendar, type CalendarEvent } from "@/components/scheduling";
import { useLanguage } from "@/lib/language";
import { ReceptionistInlineAttendance } from "./receptionist-inline-attendance";
import { useMemo, useState } from "react";

import { MemberPicker } from "@/components/MemberPicker";
import { api } from "@/lib/apiClient";
import {
  addDaysIso,
  formatDate,
  formatDateTime,
  mondayOfIso,
  todayIso,
} from "@/lib/format";
import { pagedItems } from "@/lib/paged";
import type {
  CourtRentalDto,
  CourtScheduleEntryDto,
  InvoiceDetailDto,
} from "@/lib/types";
import { useApi, useNow } from "@/lib/useApi";
import { catalogApi } from "@/features/catalog";
import { courseApi } from "@/features/courses";
import { rentalApi } from "@/features/rentals";

import { useDeskMember } from "./desk-context";
import styles from "../manager/manager-schedule.module.css";
import { ReceptionistAvailabilityGrid } from "./receptionist-availability-grid";

type View = "week" | "day" | "list";
type TypeFilter = "ALL" | "CLASS_SESSION" | "COURT_RENTAL" | "AVAILABLE_SLOT";
type StatusFilter =
  | "ALL"
  | "OPEN"
  | "LOCKED"
  | "UPCOMING"
  | "IN_PROGRESS"
  | "ENDED"
  | "CANCELLED"
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "COMPLETED"
  | "AVAILABLE";

const OPEN_MINUTE = 6 * 60;

function utcStart(localDate: string) {
  return new Date(`${localDate}T00:00:00+07:00`).toISOString();
}

function utcEndExclusive(localDate: string) {
  return new Date(`${addDaysIso(localDate, 1)}T00:00:00+07:00`).toISOString();
}

function vietnamParts(nowMs: number) {
  const shifted = new Date(nowMs + 7 * 60 * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function operatingBaseDate(nowMs: number) {
  const local = vietnamParts(nowMs);
  return local.minute < OPEN_MINUTE ? addDaysIso(local.date, -1) : local.date;
}

function temporalState(row: CourtScheduleEntryDto, now: number) {
  const raw = row.status.toUpperCase();
  if (raw.includes("CANCEL")) return "CANCELLED";
  if (now < Date.parse(row.startAtUtc)) return "UPCOMING";
  if (now < Date.parse(row.endAtUtc)) return "IN_PROGRESS";
  return "ENDED";
}

export function ReceptionistSchedule() {
  const desk = useDeskMember();
  const [date, setDate] = useState(todayIso());
  const [view, setView] = useState<View>("week");
  const { t } = useLanguage();
  const [type, setType] = useState<TypeFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [sportId, setSportId] = useState("");

  const now = useNow(30_000);

  const first =
    view === "day" ? date : mondayOfIso(date);

  const last =
    view === "day" ? date : addDaysIso(first, 6);

  const schedule = useApi(
    (signal) =>
      api.get<CourtScheduleEntryDto[]>("/api/manager/court-schedule", {
        signal,
        query: {
          fromDate: first,
          toDate: last,
          ...(desk.member?.userId ? { memberId: desk.member.userId } : {}),
        },
      }),
    [first, last, desk.member?.userId],
  );

  const courses = useApi(
    (signal) =>
      courseApi.list(
        { fromDate: first, toDate: last, page: 1, pageSize: 100 },
        signal,
      ),
    [first, last],
  );

  const sports = useApi((signal) => catalogApi.sports(signal), []);
  const rentalSports = (sports.data ?? []).filter(
    (sport) =>
      sport.isActive &&
      sport.services.some(
        (service) =>
          service.serviceType === "COURT_RENTAL" && service.isEnabled,
      ),
  );

  const effectiveSportId =
    sportId || (rentalSports[0] ? String(rentalSports[0].sportId) : "");

  const operatingDay = operatingBaseDate(now);
  const actualToday = vietnamParts(now).date;

  const availabilityDates = useMemo(
    () => [
      operatingDay,
      addDaysIso(operatingDay, 1),
      addDaysIso(operatingDay, 2),
    ],
    [operatingDay],
  );

  const availability = useApi(
    async (signal) => {
      const member = desk.member;

      if (!member || !effectiveSportId) return [];

      return Promise.all(
        availabilityDates.map(async (slotDate) => {
          if (slotDate < actualToday) {
            return { date: slotDate, calendar: null };
          }

          return {
            date: slotDate,
            calendar: await rentalApi.calendar(
              Number(effectiveSportId),
              slotDate,
              1,
              signal,
              member.userId,
            ),
          };
        }),
      );
    },
    [
      desk.member?.userId,
      effectiveSportId,
      operatingDay,
      actualToday,
    ],
  );

  const courseById = useMemo(
    () =>
      new Map(
        pagedItems(courses.data).map((course) => [course.classId, course]),
      ),
    [courses.data],
  );

  function businessState(row: CourtScheduleEntryDto) {
    if (row.sourceType === "CLASS_SESSION" && row.classId) {
      const course = courseById.get(row.classId);
      const raw = row.status.toUpperCase();

      if (raw.includes("CANCEL")) return "CANCELLED";
      if (course?.status === "CANCELLED") return "CANCELLED";
      if (course?.status === "COMPLETED") return "COMPLETED";
      if (course && !course.enrollmentOpen) return "LOCKED";
      if (course && course.availableSeats <= 0) return "LOCKED";
      if (course?.status === "PUBLISHED" || course?.status === "IN_PROGRESS")
        return "OPEN";

      return temporalState(row, now);
    }

    if (row.sourceType === "COURT_RENTAL") {
      const raw = row.status.toUpperCase();
      if (raw.includes("PENDING")) return "PENDING_PAYMENT";
      if (raw.includes("CONFIRM")) return "CONFIRMED";
      if (raw.includes("COMPLETE")) return "COMPLETED";
      if (raw.includes("CANCEL")) return "CANCELLED";
    }

    return temporalState(row, now);
  }

  const filteredRows = (() => {
    const term = query.trim().toLowerCase();

    return (schedule.data ?? []).filter((row) => {
      if (row.sourceType === "ROOM_BLOCK") return false;

      if (type !== "ALL" && type !== "AVAILABLE_SLOT" && row.sourceType !== type)
        return false;
      if (type === "AVAILABLE_SLOT") return false;

      const rowState = businessState(row);
      const timeState = temporalState(row, now);

      if (
        status !== "ALL" &&
        status !== rowState &&
        status !== timeState
      )
        return false;

      if (
        term &&
        ![
          row.title,
          row.coachName,
          row.memberName,
          row.status,
          rowState,
          ...(row.participants ?? []).flatMap((participant) => [
            participant.memberName,
            participant.memberId,
          ]),
        ].some((value) => value?.toLowerCase().includes(term))
      )
        return false;

      return true;
    });
  })();

  const selected = (schedule.data ?? []).find(
    (row) => `${row.sourceType}:${row.sourceId}` === selectedId,
  );

  const selectedRentals = useApi(
    (signal) =>
      selected?.sourceType === "COURT_RENTAL" && selected.memberId
        ? api.get<CourtRentalDto[]>(
            `/api/members/${selected.memberId}/court-rentals`,
            {
              signal,
              query: {
                fromUtc: utcStart(first),
                toUtc: utcEndExclusive(last),
              },
            },
          )
        : Promise.resolve([]),
    [selected?.sourceId, selected?.memberId, first, last],
  );

  const selectedRental = (selectedRentals.data ?? []).find(
    (rental) => rental.courtRentalId === selected?.sourceId,
  );

  const selectedInvoice = useApi(
    (signal) =>
      selectedRental?.invoiceId
        ? api.get<InvoiceDetailDto>(
            `/api/invoices/${selectedRental.invoiceId}`,
            { signal },
          )
        : Promise.resolve(null),
    [selectedRental?.invoiceId],
  );

  function changeDate(next: string) {
    setDate(next);
    setSelectedId("");
  }

  function move(offset: -1 | 1) {
    changeDate(addDaysIso(date, view === "day" ? offset : offset * 7));
  }

  const calendarEvents: CalendarEvent[] = filteredRows.map((row) => ({
    id: `${row.sourceType}:${row.sourceId}`,
    title: row.title,
    type: row.sourceType,
    startAtUtc: row.startAtUtc,
    endAtUtc: row.endAtUtc,
    roomName: null,
    coachName: row.coachName,
    status: row.sourceType === "CLASS_SESSION" && businessState(row) === "LOCKED"
      ? "LOCKED"
      : row.status,
  }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Card>
        <div className={styles.weekToolbar}>
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => { if (e.target.value) { changeDate(e.target.value); if (view !== "day") setView("week"); } }}
            />
          </Field>
          <div className={styles.weekNavigation}>
            <div
              className={styles.viewNavigation}
              role="group"
              aria-label="Calendar view"
            >
              {(["day", "week", "list"] as const).map((item) => (
                <Button
                  key={item}
                  variant="secondary"
                  size="sm"
                  className={styles.viewButton}
                  aria-pressed={view === item}
                  onClick={() => { setView(item); setSelectedId(""); }}
                >
                  {t.calendar[item]}
                </Button>
              ))}
            </div>
            <div className={styles.dateNavigation}>
              <Button
                variant="secondary"
                size="sm"
                className={styles.arrowButton}
                data-direction="previous"
                aria-label={
                  view === "day"
                    ? "Previous"
                    : "Previous week"
                }
                title={
                  view === "day"
                    ? "Previous"
                    : "Previous week"
                }
                onClick={() => move(-1)}
              >
                <ArrowLeft size={22} strokeWidth={2.25} aria-hidden="true" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className={styles.currentButton}
                onClick={() => changeDate(view === "day" ? todayIso() : mondayOfIso(todayIso()))}
              >
                {view === "day"
                  ? t.calendar.today
                  : "Current week"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className={styles.arrowButton}
                data-direction="next"
                aria-label={
                  view === "day" ? "Next" : "Next week"
                }
                title={
                  view === "day" ? "Next" : "Next week"
                }
                onClick={() => move(1)}
              >
                <ArrowRight size={22} strokeWidth={2.25} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
        <div className={styles.filters}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            gap: 12,
            marginTop: 14,
          }}
        >
          <label>
            Type
            <select
              value={type}
              onChange={(event) =>
                setType(event.target.value as TypeFilter)
              }
            >
              <option value="ALL">All</option>
              <option value="CLASS_SESSION">Classes</option>
              <option value="COURT_RENTAL">Court rentals</option>
              <option value="AVAILABLE_SLOT">Available court slots</option>
            </select>
          </label>

          <label>
            Status
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as StatusFilter)
              }
            >
              <option value="ALL">All statuses</option>
              <option value="OPEN">Open for registration</option>
              <option value="LOCKED">Locked / registration closed</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="ENDED">Ended</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="PENDING_PAYMENT">Pending payment</option>
              <option value="CONFIRMED">Rental confirmed</option>
              <option value="COMPLETED">Completed</option>
              <option value="AVAILABLE">Available court slot</option>
            </select>
          </label>

          <label>
            Search
            <input
              type="search"
              placeholder="Class, coach, renter or member"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <label>
            Court availability sport
            <select
              value={effectiveSportId}
              onChange={(event) => setSportId(event.target.value)}
            >
              {rentalSports.map((sport) => (
                <option key={sport.sportId} value={sport.sportId}>
                  {sport.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginTop: 14 }}>
          <MemberPicker value={desk.member} onChange={desk.setMember} />
          <small>
            Selecting a member filters their class/rental schedule and checks
            court availability against that member&apos;s class conflicts.
          </small>
        </div>
        </div>
      </Card>

      {schedule.error && <p role="alert">{schedule.error.message}</p>}

      {!schedule.error && (
        <Card title={view === "day" ? formatDate(date) : `${formatDate(first)} – ${formatDate(last)}`}>
          <Calendar
            events={calendarEvents}
            date={view === "day" ? date : first}
            view={view}
            labels={{
              types: t.calendar.types,
              weekdays: t.mSchedule.weekdays,
              day: t.calendar.day,
              week: t.calendar.week,
              list: t.calendar.list,
              previous: t.calendar.previous,
              today: t.calendar.today,
              next: t.calendar.next,
              empty: t.calendar.empty,
              eventDetails: t.calendar.eventDetails,
            }}
            onDateChange={changeDate}
            onViewChange={(next) => { setView(next); setSelectedId(""); }}
            onSelectEvent={(event) => setSelectedId(event.id)}
            hideToolbar
          />
        </Card>
      )}

      {selected && (
        <Drawer
          title={selected.title}
          description={`${formatDateTime(selected.startAtUtc)} – ${formatDateTime(selected.endAtUtc)}`}
          size="lg"
          onClose={() => setSelectedId("")}
        >
          <dl style={{ display: "grid", gap: 10 }}>
            <div><dt>Type</dt><dd>{selected.sourceType === "CLASS_SESSION" ? "Class session" : "Court rental"}</dd></div>
            <div><dt>Status</dt><dd>{businessState(selected)} · {temporalState(selected, now)} · {selected.status}</dd></div>
            {selected.coachName && <div><dt>Coach</dt><dd>{selected.coachName}</dd></div>}
          </dl>
          {selected.sourceType === "CLASS_SESSION" && (
            <>
              {selected.classId && courseById.get(selected.classId) && (
                <p>
                  <strong>Registration: </strong>
                  {courseById.get(selected.classId)!.enrollmentOpen
                    ? `Open · ${courseById.get(selected.classId)!.availableSeats} seats available`
                    : "Locked / registration closed"}
                </p>
              )}
              <ReceptionistInlineAttendance key={selected.sourceId} sessionId={selected.sourceId} />
            </>
          )}
          {selected.sourceType === "COURT_RENTAL" && (
            <>
              <p><strong>Renter:</strong> {selected.memberName || "—"}</p>
              <p><strong>Rental status:</strong> {selectedRental?.status || selected.status}</p>
              {selectedRentals.loading && <p>Loading rental checkout…</p>}
              {selectedRentals.error && <p role="alert">{selectedRentals.error.message}</p>}
              {selectedRental?.invoiceId && selectedInvoice.loading && <p>Loading invoice…</p>}
              {selectedInvoice.error && <p role="alert">{selectedInvoice.error.message}</p>}
              {selectedInvoice.data && (
                <>
                  <p><strong>Invoice:</strong> {selectedInvoice.data.summary.invoiceNumber}</p>
                  <p><strong>Payment:</strong> {selectedInvoice.data.summary.status} · {selectedInvoice.data.summary.fulfillmentOutcome}</p>
                  <p><strong>Checkout:</strong> {selectedInvoice.data.summary.outstanding > 0 ? "Awaiting payment" : "No outstanding balance"}</p>
                  {selectedInvoice.data.summary.reconciliationRequired && <p role="alert">Reconciliation required</p>}
                </>
              )}
              {selected.memberId && (
                <Link href={`/receptionist/members/${selected.memberId}?tab=invoices`} className="btn btn--secondary">
                  Open member invoices
                </Link>
              )}
            </>
          )}
        </Drawer>
      )}
      {(type === "ALL" || type === "AVAILABLE_SLOT") && (
        <section className="card" style={{ padding: 18 }}>
          <h3>Available court slots · 06:00–22:00 · 3 operating days</h3>
          <p>Hourly availability by court. The last slot is 21:00–22:00; the three-day window rolls over at 06:00.</p>
          {!desk.member ? (
            <p>Select a member to verify bookable slots against their schedule.</p>
          ) : availability.loading ? (
            <p>Checking court availability…</p>
          ) : availability.error ? (
            <p role="alert">{availability.error.message}</p>
          ) : (
            <ReceptionistAvailabilityGrid
              days={availability.data ?? []}
              now={now}
              selectedSport={rentalSports.find(sport => String(sport.sportId) === effectiveSportId)?.name}
            />
          )}
        </section>
      )}

    </div>
  );
}

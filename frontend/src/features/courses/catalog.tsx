"use client";
import { hasService } from "@/lib/sports";
import { pagedItems } from "@/lib/paged";
import { courseApi } from "./api";
import { useState } from "react";
import { ChevronDown, LockKeyhole, SlidersHorizontal } from "lucide-react";
import { useUrlQuery } from "@/lib/useUrlQuery";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  formatMoney,
  formatDate,
  formatDateTime,
  todayIso,
} from "@/lib/format";
import { Card, StatusChip } from "@/components/ui";
import type { CourseDto, SportDto } from "@/lib/types";
import tags from "../member/tags.module.css";
import {
  scheduleSummary,
  sessionMinutes,
  sportTone,
} from "../member/event-meta";
import styles from "./catalog.module.css";
import { useCourseEnrollments } from "./use-course-enrollments";
import {
  courseRegistrationState,
  registrationReason,
} from "./registration-state";
export function CourseCatalog({
  detailBasePath = "/courses",
  compact = false,
  pageSize,
  registrationOnly = false,
}: {
  detailBasePath?: "/courses" | "/member/discover" | "/member/services";
  compact?: boolean;
  pageSize?: number;
  registrationOnly?: boolean;
}) {
  const { t, language } = useLanguage();
  const d = t.mDiscover;
  const vi = language === "vi";
  const enrollments = useCourseEnrollments();
  const now = useNow(30000);
  // Liên kết từ trang khác (ví dụ gợi ý gia hạn) có thể mang sẵn ?sport=; chọn tay thì ưu tiên lựa chọn đó.
  const preset = useUrlQuery(
    { sport: "" },
    { sport: (value) => (/^[0-9]+$/.test(value) ? value : "") },
  ).values.sport;
  const [picked, setSport] = useState<string | null>(null);
  const sportId = picked ?? preset;
  const [fromDate, setFrom] = useState("");
  const [toDate, setTo] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(() => !!preset);
  const [page, setPage] = useState(1);
  const PAGE = pageSize ?? (compact ? 3 : 12);
  const registrationStart = todayIso();
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { anonymous: true, signal }),
    [],
  );
  // Sort the complete result before pagination, including ownership for this member.
  const courses = useApi(
    async (signal) => {
      const rows: CourseDto[] = [];
      for (let batchPage = 1; ; batchPage++) {
        const result = await courseApi.list(
          { sportId, fromDate, toDate, page: batchPage, pageSize: 100 },
          signal,
        );
        const batch = pagedItems(result);
        rows.push(...batch);
        if (
          !batch.length ||
          rows.length >= result.totalCount ||
          batch.length < 100
        )
          return rows;
      }
    },
    [sportId, fromDate, toDate],
  );
  const all = [...(courses.data ?? [])].sort(
    (a, b) =>
      Number(
        courseRegistrationState(b, enrollments.isEnrolled(b.classId), now) ===
          "open",
      ) -
        Number(
          courseRegistrationState(a, enrollments.isEnrolled(a.classId), now) ===
            "open",
        ) ||
      (a.firstSessionStartUtc ?? a.startDate).localeCompare(
        b.firstSessionStartUtc ?? b.startDate,
      ) ||
      a.classId - b.classId,
  );
  const filtered = openOnly ? all.filter((c) => c.availableSeats > 0) : all;
  const total = filtered.length;
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const hasFilter = !!(sportId || fromDate || toDate || openOnly);
  const filterCount = [sportId, fromDate, toDate, openOnly].filter(
    Boolean,
  ).length;
  function resetFilters() {
    setSport("");
    setFrom("");
    setTo("");
    setOpenOnly(false);
    setPage(1);
  }
  const filters = (
    <section className={styles.filters} aria-label={d.filtersLabel}>
      <label>
        {d.sport}
        <select
          value={sportId}
          onChange={(e) => {
            setSport(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{d.allSports}</option>
          {sports.data
            ?.filter((s) => hasService(s, "GROUP_COURSE"))
            .map((s) => (
              <option key={s.sportId} value={s.sportId}>
                {s.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        {d.from}
        <input
          type="date"
          value={fromDate}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
        />
      </label>
      <label>
        {d.to}
        <input
          type="date"
          value={toDate}
          min={fromDate || undefined}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
        />
      </label>
      <div className={styles.filterTail}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => {
              setOpenOnly(e.target.checked);
              setPage(1);
            }}
          />
          {d.openOnly}
        </label>
        {hasFilter && (
          <button
            type="button"
            className={styles.resetFilters}
            onClick={resetFilters}
          >
            {vi ? "Xóa bộ lọc" : "Clear filters"}
          </button>
        )}
      </div>
    </section>
  );
  return (
    <div className={compact ? styles.compact : undefined}>
      {compact ? (
        <details
          className={styles.filterDisclosure}
          open={filtersExpanded}
          onToggle={(event) => setFiltersExpanded(event.currentTarget.open)}
        >
          <summary>
            <SlidersHorizontal size={17} aria-hidden="true" />
            <span>{vi ? "Lọc lớp học" : "Filter classes"}</span>
            {filterCount > 0 && (
              <span className={styles.filterCount}>{filterCount}</span>
            )}
            <ChevronDown
              size={17}
              className={styles.filterChevron}
              aria-hidden="true"
            />
          </summary>
          {filters}
        </details>
      ) : (
        filters
      )}
      {detailBasePath.startsWith("/member") && (
        <p className={styles.note}>{d.independent}</p>
      )}

      {courses.loading ? (
        <div className={styles.grid} aria-busy="true" aria-label={d.loading}>
          {Array.from({ length: compact ? 3 : 6 }).map((_, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: compact ? 180 : 300, borderRadius: 16 }}
            />
          ))}
        </div>
      ) : courses.error ? (
        <div className={styles.empty} role="alert" data-surface="inverse">
          <h3>{d.errorTitle}</h3>
          <p>{courses.error.message}</p>
          <div className={styles.emptyActions}>
            <button className="btn" onClick={courses.reload}>
              {d.retry}
            </button>
          </div>
        </div>
      ) : !shown.length ? (
        <div className={styles.empty} data-surface="inverse">
          <h3>{d.emptyTitle}</h3>
          <p>{hasFilter ? d.emptyFiltered : d.emptyAll}</p>
          {detailBasePath.startsWith("/member") && (
            <div className={styles.emptyActions}>
              <Link
                className="btn"
                href="/member/services?section=courts&view=explore"
              >
                {d.rent}
              </Link>
              <Link
                className="btn btn--secondary"
                href="/member/services?section=gym&view=explore"
              >
                {d.gymPt}
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className={styles.count} aria-live="polite">
            {total === 1
              ? d.resultOne
              : d.resultCount.replace("{n}", String(total))}
          </p>
          <div className={styles.grid}>
            {shown.map((c) => {
              const enrolled = enrollments.isEnrolled(c.classId);
              const registration = courseRegistrationState(c, enrolled, now);
              const closed = registration !== "open" && !enrolled;
              const schedule = scheduleSummary(
                c.scheduleRules,
                sessionMinutes(sports.data, c.sportId),
                d.days,
                vi,
              );
              const state =
                c.availableSeats <= 0
                  ? "full"
                  : c.availableSeats <= 3
                    ? "few"
                    : "ok";
              return (
                <article
                  key={c.classId}
                  className={styles.course}
                  data-registration={registration}
                >
                  <div className={styles.courseHead}>
                    <span
                      className={tags.sport}
                      data-sport={sportTone(c.sportName)}
                    >
                      {c.sportName}
                    </span>
                    <span className={tags.kind}>
                      {d.sessions.replace("{n}", String(c.numSessions))}
                    </span>
                    {enrolled && (
                      <StatusChip
                        value="CONFIRMED"
                        label={vi ? "Đã đăng ký" : "Registered"}
                        tone="success"
                      />
                    )}
                    {registrationOnly && (
                      <span className={tags.kind}>
                        {registration === "started" ||
                        c.startDate < registrationStart
                          ? vi
                            ? "Đã khai giảng"
                            : "Already started"
                          : c.startDate > registrationStart
                            ? vi
                              ? "Sắp khai giảng"
                              : "Starting soon"
                            : vi
                              ? "Khai giảng hôm nay"
                              : "Starts today"}
                      </span>
                    )}
                  </div>
                  <h3>{c.name}</h3>
                  {compact ? (
                    <details className={styles.classDetails}>
                      <summary>
                        {vi ? "Coach & lịch học" : "Coach & schedule"}
                      </summary>
                      <dl className={styles.facts}>
                        <dt>{d.coach}</dt>
                        <dd>{c.coachName || d.coachTbc}</dd>
                        <dt>{d.room}</dt>
                        <dd>{c.roomName}</dd>
                        <dt>{d.schedule}</dt>
                        <dd>{schedule ?? d.scheduleTbc}</dd>
                        <dt>{d.startDate}</dt>
                        <dd>{formatDate(c.startDate)}</dd>
                      </dl>{" "}
                    </details>
                  ) : (
                    <dl className={styles.facts}>
                      <dt>{d.coach}</dt>
                      <dd>{c.coachName || d.coachTbc}</dd>
                      <dt>{d.room}</dt>
                      <dd>{c.roomName}</dd>
                      <dt>{d.schedule}</dt>
                      <dd>{schedule ?? d.scheduleTbc}</dd>
                      <dt>{d.startDate}</dt>
                      <dd>{formatDate(c.startDate)}</dd>
                    </dl>
                  )}

                  <div className={styles.courseFoot}>
                    <div>
                      <p className={styles.price}>
                        <span className={styles.priceLabel}>{d.fee}</span>
                        {formatMoney(c.price)}
                      </p>
                      <p className={styles.seats} data-state={state}>
                        {enrolled
                          ? vi
                            ? "Bạn đã đăng ký lớp này"
                            : "You are registered for this class"
                          : closed
                            ? vi
                              ? "Không nhận đăng ký"
                              : "Not accepting registrations"
                            : state === "full"
                              ? d.full
                              : (state === "few" ? d.fewSeats : d.seatsLeft)
                                  .replace("{left}", String(c.availableSeats))
                                  .replace("{cap}", String(c.capacity))}
                      </p>
                    </div>
                    <div className={styles.courseActions}>
                      {closed && (
                        <>
                          <button
                            type="button"
                            className="btn btn--secondary"
                            disabled
                          >
                            <LockKeyhole size={16} aria-hidden="true" />
                            {vi
                              ? "Không thể đăng ký"
                              : "Registration unavailable"}
                          </button>
                          <p className={styles.closedReason}>
                            {registrationReason(registration, vi)}
                          </p>
                        </>
                      )}
                      <Link
                        className={closed ? "btn btn--quiet" : "btn"}
                        href={
                          enrolled && detailBasePath.startsWith("/member")
                            ? `/member/schedule?course=${c.classId}`
                            : detailBasePath === "/member/services"
                              ? `/member/services/courses/${c.classId}`
                              : `${detailBasePath}/${c.classId}`
                        }
                      >
                        {enrolled
                          ? vi
                            ? "Xem lớp đã đăng ký"
                            : "View registered class"
                          : closed
                            ? vi
                              ? "Xem thông tin"
                              : "View information"
                            : d.view}
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {pages > 1 && (
            <nav className={styles.pager} aria-label={d.filtersLabel}>
              <button
                className="btn btn--secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                {d.prev}
              </button>
              <span>
                {d.page
                  .replace("{page}", String(page))
                  .replace("{pages}", String(pages))}
              </span>
              <button
                className="btn btn--secondary"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                {d.next}
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
export function CourseSessions({
  classId,
  mine = false,
}: {
  classId: number;
  mine?: boolean;
}) {
  const { t } = useLanguage();
  const state = useApi(
    (signal) => courseApi.sessions(classId, mine, signal),
    [classId, mine],
  );
  return (
    <Card title={t.refactor.schedule}>
      {state.loading ? (
        <p>{t.refactor.loading}</p>
      ) : state.error ? (
        <p role="alert">{state.error.message}</p>
      ) : !state.data?.length ? (
        <p>{t.refactor.empty}</p>
      ) : (
        <ul>
          {state.data.map((s) => (
            <li key={s.sessionId}>
              {s.sessionNo}. {formatDateTime(s.startAtUtc)} –{" "}
              {formatDateTime(s.endAtUtc)} · {s.roomName} · {s.coachName} ·{" "}
              <StatusChip value={s.status} />
              {s.isMakeup ? " ↪" : ""}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
export { CourseDetail } from "./member-course-detail";

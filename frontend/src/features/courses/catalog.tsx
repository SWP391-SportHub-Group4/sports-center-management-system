"use client";
import { hasService } from "@/lib/sports";
import { pagedItems } from "@/lib/paged";
import { courseApi } from "./api";
import { useState } from "react";
import { useUrlQuery } from "@/lib/useUrlQuery";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  formatMoney,
  formatDate,
  formatDateTime,
  todayIso,
} from "@/lib/format";
import { Card, StatusChip } from "@/components/ui";
import type { SportDto } from "@/lib/types";
import tags from "../member/tags.module.css";
import {
  scheduleSummary,
  sessionMinutes,
  sportTone,
} from "../member/event-meta";
import styles from "./catalog.module.css";
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
  const [page, setPage] = useState(1);
  const PAGE = pageSize ?? (compact ? 3 : 12);
  const registrationStart = registrationOnly ? todayIso() : "";
  const effectiveFromDate =
    registrationOnly && fromDate < registrationStart
      ? registrationStart
      : fromDate;
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { anonymous: true, signal }),
    [],
  );
  const courses = useApi(
    (signal) =>
      courseApi.list(
        {
          sportId,
          fromDate: effectiveFromDate,
          toDate,
          page,
          pageSize: PAGE,
          openOnly,
        },
        signal,
      ),
    [sportId, effectiveFromDate, toDate, page, openOnly],
  );
  const shown = pagedItems(courses.data);
  const total = courses.data?.totalCount ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const hasFilter = !!(sportId || fromDate || toDate || openOnly);
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
          min={registrationStart || undefined}
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
      </div>
    </section>
  );
  return (
    <div className={compact ? styles.compact : undefined}>
      {filters}
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
                <article key={c.classId} className={styles.course}>
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
                    {registrationOnly && (
                      <span className={tags.kind}>
                        {c.startDate > registrationStart
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


                  <div className={styles.courseFoot}>
                    <div>
                      <p className={styles.price}>
                        <span className={styles.priceLabel}>{d.fee}</span>
                        {formatMoney(c.price)}
                      </p>
                      <p className={styles.seats} data-state={state}>
                        {state === "full"
                          ? d.full
                          : (state === "few" ? d.fewSeats : d.seatsLeft)
                              .replace("{left}", String(c.availableSeats))
                              .replace("{cap}", String(c.capacity))}
                      </p>
                    </div>
                    <Link
                      className="btn"
                      href={
                        detailBasePath === "/member/services"
                          ? `/member/services/courses/${c.classId}`
                          : `${detailBasePath}/${c.classId}`
                      }
                    >
                      {d.view}
                    </Link>
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

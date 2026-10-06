"use client";
import { hasService } from "@/lib/sports";
import { pagedItems } from "@/lib/paged";
import { courseApi } from "./api";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { Card, StatusChip } from "@/components/ui";
import type { SportDto } from "@/lib/types";
import { CheckoutPanel } from "@/features/payments";
import { useAuth } from "@/lib/auth";
import styles from "./catalog.module.css";
export function CourseCatalog({
  detailBasePath = "/courses",
}: {
  detailBasePath?: "/courses" | "/member/discover";
}) {
  const { t } = useLanguage();
  const l = t.refactor;
  const [sportId, setSport] = useState("");
  const [fromDate, setFrom] = useState("");
  const [toDate, setTo] = useState("");
  const [page, setPage] = useState(1);
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { anonymous: true, signal }),
    [],
  );
  const courses = useApi(
    (signal) =>
      courseApi.list({ sportId, fromDate, toDate, page, pageSize: 12 }, signal),
    [sportId, fromDate, toDate, page],
  );
  return (
    <>
      <div className={styles.filters}>
        <label>
          {l.all}
          <select
            value={sportId}
            onChange={(e) => {
              setSport(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{l.all}</option>
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
          {l.from}
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
          {l.to}
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {courses.loading ? (
        <p>{l.loading}</p>
      ) : courses.error ? (
        <p role="alert">
          {courses.error.message}
          <button onClick={courses.reload}>{l.refresh}</button>
        </p>
      ) : !pagedItems(courses.data).length ? (
        <p>{l.empty}</p>
      ) : (
        <div className="refactor-grid">
          {pagedItems(courses.data).map((c) => (
            <Card key={c.classId} title={c.name}>
              <p>
                {c.sportName} · {c.coachName} · {c.roomName}
              </p>
              <p>
                {formatDate(c.startDate)} · {c.numSessions} {l.sessions} ·{" "}
                {c.availableSeats} {l.seats}
              </p>
              <p>{formatMoney(c.price)}</p>
              <Link href={`${detailBasePath}/${c.classId}`}>{l.details}</Link>
            </Card>
          ))}
        </div>
      )}
      <button
        className="btn btn--secondary"
        disabled={page === 1 || courses.loading}
        onClick={() => setPage(page - 1)}
      >
        {l.previous}
      </button>
      <button
        className="btn btn--secondary"
        disabled={
          !courses.data ||
          page * 12 >= courses.data.totalCount ||
          courses.loading
        }
        onClick={() => setPage(page + 1)}
      >
        {l.more}
      </button>
    </>
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
export function CourseDetail({ classId }: { classId: number }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const state = useApi(
    (signal) => courseApi.detail(classId, signal),
    [classId],
  );
  return (
    <>
      {state.loading ? (
        <p>{t.refactor.loading}</p>
      ) : state.error ? (
        <p role="alert">{state.error.message}</p>
      ) : (
        state.data && (
          <Card title={state.data.name}>
            <p>
              {state.data.sportName} · {state.data.coachName} ·{" "}
              {state.data.roomName}
            </p>
            <p>
              {formatMoney(state.data.price)} · {state.data.availableSeats}{" "}
              {t.refactor.seats}
            </p>
          </Card>
        )
      )}
      <CourseSessions classId={classId} />
      {state.data &&
        (user?.role === "Member"
          ? state.data.availableSeats > 0 && (
              <CheckoutPanel intent={{ kind: "class", body: { classId } }} />
            )
          : !user && (
              <Link
                href={`/login?next=${encodeURIComponent(`/courses/${classId}`)}`}
              >
                {t.refactor.login}
              </Link>
            ))}
    </>
  );
}

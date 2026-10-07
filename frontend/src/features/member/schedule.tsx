"use client";

import Link from "next/link";
import { useState } from "react";
import { Drawer } from "@/components/primitives";
import { AsyncSection, StatusChip } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { addDaysIso, formatDate, formatTime, todayIso } from "@/lib/format";
import { useUrlQuery } from "@/lib/useUrlQuery";
import { rentalApi } from "../rentals/api";
import type { SportDto } from "@/lib/types";
import { memberSchedule, type MemberEvent } from "./api";
import { eventKind, sportTone, type EventKind } from "./event-meta";
import tags from "./tags.module.css";
import styles from "./schedule.module.css";

type View = "day" | "week" | "list";
type Item = MemberEvent & {
  kind: EventKind;
  refId: string;
  sport: string | null;
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
  ptTitle: (c: string) => string,
  rentalTitle: string,
): Promise<Item[]> {
  const fromUtc = new Date(`${date}T00:00:00+07:00`).toISOString();
  const toUtc = new Date(
    `${addDaysIso(date, days)}T00:00:00+07:00`,
  ).toISOString();
  const [base, rentals, sports] = await Promise.all([
    memberSchedule(date, days, signal),
    rentalApi.mine(fromUtc, toUtc, signal).catch(() => []),
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
      title: kind === "pt" ? ptTitle(e.coachName ?? "") : e.title,
    };
  });
  for (const r of rentals.filter(
    (x) => x.status === "CONFIRMED" || x.status === "COMPLETED",
  )) {
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
    });
  }
  return items.sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
}

export function MemberSchedule() {
  const { t, language } = useLanguage();
  const m = t.mSchedule;
  const vi = language === "vi";
  const { values, setValues } = useUrlQuery(
    { date: todayIso() },
    { date: scheduleDate },
  );
  const date = values.date;
  const [view, setView] = useState<View>("week");
  const [hidden, setHidden] = useState<EventKind[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const days = view === "day" ? 1 : view === "week" ? 7 : 30;
  const kindLabel: Record<EventKind, string> = {
    class: m.kindClass,
    pt: m.kindPt,
    rental: m.kindRental,
  };
  const state = useApi(
    (signal) =>
      loadTimeline(
        date,
        days,
        signal,
        "Gym",
        (c) => (vi ? `PT cùng ${c}` : `PT with ${c}`),
        m.rentalTitle,
      ),
    [date, days, vi],
  );

  const locale = vi ? "vi-VN" : "en-GB";
  const fmt = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  const last = addDaysIso(date, days - 1);
  const range =
    view === "day"
      ? m.rangeDay.replace(
          "{date}",
          fmt(date, { weekday: "long", day: "numeric", month: "long" }),
        )
      : view === "week"
        ? m.rangeWeek
            .replace("{from}", fmt(date, { day: "numeric", month: "numeric" }))
            .replace("{to}", fmt(last, { day: "numeric", month: "numeric" }))
        : m.rangeList.replace(
            "{from}",
            fmt(date, { day: "numeric", month: "numeric" }),
          );

  const renderEvent = (item: Item) => {
    const cancelled = /CANCEL/i.test(item.status ?? "");
    return (
      <button
        key={item.id}
        type="button"
        className={styles.event}
        data-state={cancelled ? "cancelled" : undefined}
        onClick={() => setSelected(item)}
      >
        <time dateTime={item.startAtUtc}>
          {formatTime(item.startAtUtc)} – {formatTime(item.endAtUtc)}
        </time>
        <strong>{item.title}</strong>
        <span className={styles.eventTags}>
          {item.sport && (
            <span className={tags.sport} data-sport={sportTone(item.sport)}>
              {item.sport}
            </span>
          )}
          <span className={tags.kind}>{kindLabel[item.kind]}</span>
        </span>
        <span className={styles.meta}>
          {[
            item.kind === "rental" ? null : item.roomName || m.roomTbc,
            item.kind === "class" ? item.coachName : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {exceptional(item.status) && <StatusChip value={item.status} />}
      </button>
    );
  };

  const renderDay = (day: string, items: Item[]) => {
    const isToday = day === todayIso();
    return (
      <section
        key={day}
        className={styles.dayCol}
        aria-label={fmt(day, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      >
        <h3
          className={styles.dayHead}
          data-today={isToday}
          style={{ margin: 0 }}
        >
          <strong>{fmt(day, { day: "numeric" })}</strong>
          {fmt(day, { weekday: "long" })}
          {isToday && <span className={styles.todayTag}>{m.todayTag}</span>}
        </h3>
        {items.length ? (
          items.map(renderEvent)
        ) : (
          <p className={styles.free}>{m.dayEmpty}</p>
        )}
      </section>
    );
  };

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.group} role="group" aria-label={m.viewLabel}>
          {(["day", "week", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
                setSelected(null);
              }}
            >
              {m[v]}
            </button>
          ))}
        </div>
        <div className={styles.nav}>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setValues({ date: addDaysIso(date, -days) })}
          >
            ← {m.prev}
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setValues({ date: todayIso() })}
          >
            {m.today}
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setValues({ date: addDaysIso(date, days) })}
          >
            {m.next} →
          </button>
          <p className={styles.range} aria-live="polite">
            {range}
          </p>
        </div>
      </div>

      <div className={styles.filters} role="group" aria-label={m.filterLabel}>
        <span>{m.filterLabel}</span>
        {(["class", "pt", "rental"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={styles.chip}
            aria-pressed={!hidden.includes(k)}
            onClick={() =>
              setHidden((h) =>
                h.includes(k) ? h.filter((x) => x !== k) : [...h, k],
              )
            }
          >
            {kindLabel[k]}
          </button>
        ))}
      </div>

      <AsyncSection state={state}>
        {(all) => {
          const items = all.filter((i) => !hidden.includes(i.kind));
          const byDay = new Map<string, Item[]>();
          for (let i = 0; i < days; i++) byDay.set(addDaysIso(date, i), []);
          for (const item of items)
            byDay.get(vnDay(item.startAtUtc))?.push(item);

          if (!all.length)
            return (
              <div className={styles.empty} data-surface="inverse">
                <h3>
                  {date === todayIso() && view === "week"
                    ? m.emptyTitle
                    : m.emptyRange}
                </h3>
                <p>{m.emptyBody}</p>
                <div className={styles.emptyActions}>
                  <Link className="btn" href="/member/discover">
                    {m.ctaCourses}
                  </Link>
                  <Link className="btn btn--secondary" href="/member/pt/book">
                    {m.ctaPt}
                  </Link>
                  <Link
                    className="btn btn--secondary"
                    href="/member/courts/book"
                  >
                    {m.ctaRental}
                  </Link>
                </div>
              </div>
            );
          if (!items.length)
            return <p className={styles.free}>{m.noneFiltered}</p>;
          if (view === "list") {
            const withItems = [...byDay.entries()].filter(
              ([, list]) => list.length,
            );
            return (
              <div className={styles.stack}>
                {withItems.map(([day, list]) => renderDay(day, list))}
              </div>
            );
          }
          return (
            <div className={view === "week" ? styles.week : styles.stack}>
              {[...byDay.entries()].map(([day, list]) => renderDay(day, list))}
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
                <StatusChip value={selected.status} />
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
            <Link
              className="btn"
              href={
                selected.kind === "class"
                  ? `/member/courses/${selected.classId}`
                  : selected.kind === "pt"
                    ? `/member/pt/sessions/${selected.refId}`
                    : `/member/rentals/${selected.refId}`
              }
            >
              {selected.kind === "class"
                ? m.openClass
                : selected.kind === "pt"
                  ? m.openPt
                  : m.openRental}
            </Link>
          </div>
        </Drawer>
      )}
    </>
  );
}

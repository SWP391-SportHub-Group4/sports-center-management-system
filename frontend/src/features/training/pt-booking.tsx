"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AsyncSection, Feedback, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { addDaysIso, formatTime, todayIso } from "@/lib/format";
import type {
  PtAvailabilityDto,
  PtEntitlementDto,
  PtSessionDto,
} from "@/lib/types";
import styles from "./training.module.css";
import { PtSessionPurchase } from "./pt-session-purchase";

const WINDOW_DAYS = 7;
const TZ = "Asia/Ho_Chi_Minh";
const dayKey = (utc: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(utc));

/**
 * Member tự đặt buổi PT (A07 / G05). Server là nguồn sự thật về giờ trống: giao diện chỉ hiển thị khung do server trả,
 * và khi đặt trùng (409) thì tải lại danh sách thay vì giả định khung vẫn còn.
 */
export function PtBooking({ showBackLink = true }: { showBackLink?: boolean }) {
  const { language } = useLanguage();
  const legacyEntitlements = useApi(
    (signal) =>
      api.get<PtEntitlementDto[]>("/api/members/me/pt-entitlements", {
        signal,
      }),
    [],
  );
  return (
    <div className="stack">
      <PtSessionPurchase showBackLink={showBackLink} />
      {legacyEntitlements.data?.some(
        (e) =>
          e.totalQuota > 1 &&
          e.status.toUpperCase() === "ACTIVE" &&
          e.remainingQuota > 0,
      ) && (
        <details>
          <summary>
            {language === "vi"
              ? "Đặt lịch bằng gói PT đã mua trước đây"
              : "Book using a previously purchased PT package"}
          </summary>
          <LegacyPtBooking showBackLink={false} />
        </details>
      )}
    </div>
  );
}

function LegacyPtBooking({ showBackLink = true }: { showBackLink?: boolean }) {
  const { t, language } = useLanguage();
  const l = t.ptBook;
  const today = todayIso();
  const [from, setFrom] = useState(today);
  const [entitlementPick, setEntitlement] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [roomPick, setRoom] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const submitting = useRef(false);

  const entitlements = useApi(
    (signal) =>
      api.get<PtEntitlementDto[]>("/api/members/me/pt-entitlements", {
        signal,
      }),
    [],
  );
  const active = (entitlements.data ?? []).filter(
    (e) => e.status.toUpperCase() === "ACTIVE" && e.totalQuota > 1,
  );
  const entitlementId = entitlementPick || active[0]?.entitlementId || "";
  const to = addDaysIso(from, WINDOW_DAYS - 1);
  const availability = useApi(
    (signal) =>
      entitlementId
        ? api.get<PtAvailabilityDto>(
            `/api/members/me/pt-entitlements/${entitlementId}/availability`,
            { signal, query: { fromDate: from, toDate: to } },
          )
        : Promise.resolve(null),
    [entitlementId, from, to, revision],
  );

  const dateLabel = (iso: string, long = false) =>
    new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-GB", {
      timeZone: "UTC",
      weekday: "short",
      day: "2-digit",
      month: long ? "long" : "2-digit",
    }).format(new Date(`${iso}T00:00:00Z`));

  function reasonText(reason: string) {
    return reason === "pt_quota_exhausted"
      ? l.reasonQuota
      : reason === "pt_relationship_required"
        ? l.reasonRelationship
        : reason === "pt_no_room_configured"
          ? l.reasonNoRoom
          : l.reasonInactive;
  }

  async function book(
    data: PtAvailabilityDto,
    startAtUtc: string,
    roomId: number | null,
  ) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const session = await api.post<PtSessionDto>(
        "/api/members/me/pt-sessions",
        {
          entitlementId: data.entitlementId,
          startAtUtc,
          roomId,
        },
      );
      // This is a tab change within the Training page. Notify its URL-backed tabs
      // immediately so the new session detail is shown without a full reload.
      window.history.pushState(null, "", `/member/training?session=${session.sessionId}&booked=1`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        cause.status === 409 &&
        cause.code === "pt_slot_unavailable"
      ) {
        setError(l.taken);
        setSlot(null);
        setRevision((n) => n + 1);
      } else if (
        cause instanceof ApiError &&
        cause.status === 409 &&
        cause.code === "pt_member_conflict"
      ) {
        setError(cause.message);
        setSlot(null);
        setRevision((n) => n + 1);
      } else {
        setError(cause instanceof ApiError ? cause.message : String(cause));
        // Recheck quota/relationship/validity after every rejected or uncertain write.
        setSlot(null);
        setRevision((n) => n + 1);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      {showBackLink && (
        <Link className={styles.back} href="/member/training">
          ← {l.back}
        </Link>
      )}

      <AsyncSection state={entitlements}>
        {() =>
          !active.length ? (
            <div className={styles.panel}>
              <p className={styles.muted}>{l.noPackage}</p>
              <Link
                className="btn"
                href="/member/services?section=pt&view=owned"
              >
                {l.buyMore}
              </Link>
            </div>
          ) : null
        }
      </AsyncSection>

      {active.length > 1 && (
        <Field label={l.package}>
          <select
            value={entitlementId}
            onChange={(e) => {
              setEntitlement(e.target.value);
              setDay(null);
              setSlot(null);
            }}
          >
            {active.map((e) => (
              <option key={e.entitlementId} value={e.entitlementId}>
                {e.coachName}
              </option>
            ))}
          </select>
        </Field>
      )}

      {entitlementId && (
        <AsyncSection state={availability}>
          {(data) => {
            if (!data) return null;
            const byDay = new Map<string, PtAvailabilityDto["slots"]>();
            for (const s of data.slots) {
              const k = dayKey(s.startAtUtc);
              byDay.set(k, [...(byDay.get(k) ?? []), s]);
            }
            const days = Array.from({ length: WINDOW_DAYS }, (_, i) =>
              addDaysIso(from, i),
            );
            const selectedDay =
              day && days.includes(day)
                ? day
                : (days.find((d) => byDay.has(d)) ?? null);
            const times = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
            const chosen =
              data.slots.find((s) => s.startAtUtc === slot) ?? null;
            const room = chosen
              ? (chosen.rooms.find((r) => r.roomId === roomPick) ??
                chosen.rooms[0])
              : null;
            const lastDay = addDaysIso(today, data.policy.advanceDays);

            return (
              <>
                <section className={styles.summary} aria-label={data.coachName}>
                  <div>
                    <p className={styles.summaryLabel}>{t.ptOps.yourCoach}</p>
                    <p className={styles.coachName}>{data.coachName}</p>
                    <p className={styles.muted}>
                      {l.lead
                        .replace("{coach}", data.coachName)
                        .replace("{minutes}", String(data.sessionMinutes))}
                    </p>
                  </div>
                  <div className={styles.next}>
                    <p className={styles.quotaLine}>
                      <strong>{data.remainingQuota}</strong>
                      <span>
                        {l.quotaLeft.replace(
                          "{n}",
                          String(data.remainingQuota),
                        )}
                      </span>
                    </p>
                    <p className={styles.muted}>
                      {l.policy
                        .replace("{lead}", String(data.policy.minLeadHours))
                        .replace("{days}", String(data.policy.advanceDays))
                        .replace(
                          "{deadline}",
                          String(data.policy.changeDeadlineHours),
                        )}
                    </p>
                  </div>
                </section>

                {data.bookableReason ? (
                  <div className={styles.panel} role="status">
                    <p>{reasonText(data.bookableReason)}</p>
                    {data.bookableReason === "pt_quota_exhausted" && (
                      <Link
                        className="btn"
                        href="/member/services?section=pt&view=owned"
                      >
                        {l.buyMore}
                      </Link>
                    )}
                  </div>
                ) : (
                  <>
                    <div className={styles.weekNav}>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        disabled={from <= today}
                        onClick={() => {
                          setFrom(
                            addDaysIso(from, -WINDOW_DAYS) < today
                              ? today
                              : addDaysIso(from, -WINDOW_DAYS),
                          );
                          setDay(null);
                          setSlot(null);
                        }}
                      >
                        ← {l.prevWeek}
                      </button>
                      <strong>
                        {l.weekOf
                          .replace("{from}", dateLabel(from))
                          .replace("{to}", dateLabel(to))}
                      </strong>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        disabled={addDaysIso(from, WINDOW_DAYS) > lastDay}
                        onClick={() => {
                          setFrom(addDaysIso(from, WINDOW_DAYS));
                          setDay(null);
                          setSlot(null);
                        }}
                      >
                        {l.nextWeek} →
                      </button>
                    </div>

                    {!data.slots.length ? (
                      <p className={styles.muted}>{l.noSlotsWeek}</p>
                    ) : (
                      <>
                        <div
                          className={styles.days}
                          role="group"
                          aria-label={l.weekOf
                            .replace("{from}", dateLabel(from))
                            .replace("{to}", dateLabel(to))}
                        >
                          {days.map((d) => {
                            const count = byDay.get(d)?.length ?? 0;
                            return (
                              <button
                                key={d}
                                type="button"
                                className={styles.day}
                                aria-pressed={selectedDay === d}
                                disabled={count === 0}
                                onClick={() => {
                                  setDay(d);
                                  setSlot(null);
                                }}
                              >
                                <strong>{dateLabel(d)}</strong>
                                <span>
                                  {count
                                    ? l.dayCount.replace("{n}", String(count))
                                    : "—"}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <section
                          className={styles.section}
                          aria-labelledby="pick-time"
                        >
                          <h2 id="pick-time">{l.pickTime}</h2>
                          {times.length ? (
                            <div className={styles.times}>
                              {times.map((s) => (
                                <button
                                  key={s.startAtUtc}
                                  type="button"
                                  className={styles.time}
                                  aria-pressed={slot === s.startAtUtc}
                                  onClick={() => {
                                    setSlot(s.startAtUtc);
                                    setRoom(null);
                                    setError(null);
                                  }}
                                >
                                  {formatTime(s.startAtUtc)}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className={styles.muted}>{l.noSlotsDay}</p>
                          )}
                        </section>
                      </>
                    )}

                    {chosen && room && (
                      <form
                        className={styles.panel}
                        aria-label={l.summary}
                        onSubmit={(e) => {
                          e.preventDefault();
                          void book(data, chosen.startAtUtc, room.roomId);
                        }}
                      >
                        <h2>{l.summary}</h2>
                        <dl className={styles.facts}>
                          <div className={styles.fact}>
                            <dt>{l.when}</dt>
                            <dd>
                              {dateLabel(dayKey(chosen.startAtUtc), true)} ·{" "}
                              {formatTime(chosen.startAtUtc)} –{" "}
                              {formatTime(chosen.endAtUtc)}
                            </dd>
                          </div>
                          <div className={styles.fact}>
                            <dt>{t.ptOps.coach}</dt>
                            <dd>{data.coachName}</dd>
                          </div>
                          <div className={styles.fact}>
                            <dt>{l.where}</dt>
                            <dd>{room.name}</dd>
                          </div>
                        </dl>
                        {chosen.rooms.length > 1 && (
                          <Field label={l.room}>
                            <select
                              value={room.roomId}
                              onChange={(e) => setRoom(Number(e.target.value))}
                            >
                              {chosen.rooms.map((r) => (
                                <option key={r.roomId} value={r.roomId}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                        )}
                        <p className={styles.muted}>
                          {l.afterBooking.replace(
                            "{n}",
                            String(Math.max(0, data.remainingQuota - 1)),
                          )}
                        </p>
                        <div className="btn-row">
                          <button type="submit" className="btn" disabled={busy}>
                            {busy ? l.booking : l.confirm}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            disabled={busy}
                            onClick={() => setSlot(null)}
                          >
                            {l.cancel}
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                )}
                <Feedback error={error} />
              </>
            );
          }}
        </AsyncSection>
      )}
    </div>
  );
}

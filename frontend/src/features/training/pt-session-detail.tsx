"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { AsyncSection, Feedback, Field, StatusChip } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useAction, useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatTime } from "@/lib/format";
import { CourseSticker } from "@/features/courses";
import { pagedItems } from "@/lib/paged";
import type { PtChangeRequestDto, PtSessionDto } from "@/lib/types";
import { RequestList, isPending } from "./request-list";
import styles from "./training.module.css";

const HOUR = 3_600_000;
const subscribeToLocation = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};
const hasBookedQuery = () =>
  new URLSearchParams(window.location.search).get("booked") === "1";
const hasBookedQueryOnServer = () => false;

/** Chi tiết một buổi PT (A08): lịch hiện tại, quy tắc 24 giờ và yêu cầu hủy/đổi. Gửi yêu cầu không đổi lịch. */
export function PtSessionDetail({ sessionId }: { sessionId: string }) {
  const { t, language } = useLanguage();
  const l = t.ptOps;
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"CANCEL" | "RESCHEDULE">("CANCEL");
  const [reason, setReason] = useState("");
  const [start, setStart] = useState("");
  const [exception, setException] = useState(false);
  const [now] = useState(() => Date.now());
  const action = useAction();
  // Vừa đặt xong ở /member/pt/book: xác nhận ngay trên trang chi tiết.
  const justBooked = useSyncExternalStore(
    subscribeToLocation,
    hasBookedQuery,
    hasBookedQueryOnServer,
  );

  const sessions = useApi(
    (signal) =>
      api.get<PtSessionDto[]>("/api/members/me/pt-sessions", {
        signal,
        query: { page: 1, pageSize: 100 },
      }),
    [revision],
  );
  const requests = useApi(
    (signal) =>
      api.get<PtChangeRequestDto[]>(
        "/api/members/me/pt-session-change-requests",
        { signal },
      ),
    [revision],
  );

  return (
    <div className={styles.page}>
      <Link className={styles.back} href="/member/training">
        ← {l.back}
      </Link>
      {justBooked && (
        <div className={styles.panel} role="status">
          <h2>{t.ptBook.bookedTitle}</h2>
          <p className={styles.muted}>
            {t.ptBook.bookedBody.replace("{deadline}", "24")}
          </p>
          <div className="btn-row">
            <Link
              className="btn btn--secondary"
              href="/member/training?tab=book"
            >
              {t.ptBook.bookAnother}
            </Link>
          </div>
        </div>
      )}
      <AsyncSection state={sessions}>
        {(data) => {
          const s = pagedItems(data).find((x) => x.sessionId === sessionId);
          if (!s) return <p role="alert">{l.notFound}</p>;
          const mine = (requests.data ?? []).filter(
            (q) => q.sessionId === sessionId,
          );
          const pending = mine.some((q) => isPending(q.status));
          const startsIn = new Date(s.startAtUtc).getTime() - now;
          const scheduled =
            s.status.toUpperCase() === "SCHEDULED" && startsIn > 0;
          const late = scheduled && startsIn < 24 * HOUR;
          const canRequest = scheduled && !pending;

          async function submit() {
            const ok = await action.run(
              () =>
                api.post(
                  `/api/members/me/pt-sessions/${sessionId}/change-requests`,
                  {
                    requestType: kind,
                    reason: reason.trim(),
                    requestsException: late ? exception : false,
                    requestedStartAtUtc:
                      kind === "RESCHEDULE"
                        ? new Date(`${start}+07:00`).toISOString()
                        : null,
                  },
                ),
              l.sent,
            );
            if (ok !== null) {
              setOpen(false);
              setReason("");
              setStart("");
              setException(false);
              setRevision((n) => n + 1);
            }
          }

          return (
            <>
              <header className={styles.trainingIntro}>
                <div>
                  <h2>
                    {language === "vi"
                      ? "Buổi tập cùng coach"
                      : "Your PT session"}
                  </h2>
                  <p>
                    {s.coachName} · {s.roomName || l.roomTbc}
                  </p>
                </div>
                <div className={styles.introSticker} aria-hidden="true">
                  <CourseSticker sport="Gym" compact />
                </div>
              </header>
              <dl className={styles.facts}>
                <div className={styles.fact}>
                  <dt>{l.time}</dt>
                  <dd>
                    {formatDateTime(s.startAtUtc)}–{formatTime(s.endAtUtc)}
                  </dd>
                </div>
                <div className={styles.fact}>
                  <dt>{l.coach}</dt>
                  <dd>{s.coachName}</dd>
                </div>
                <div className={styles.fact}>
                  <dt>{l.room}</dt>
                  <dd>{s.roomName || l.roomTbc}</dd>
                </div>
                <div className={styles.fact}>
                  <dt>{l.status}</dt>
                  <dd>
                    <StatusChip value={s.status} />
                  </dd>
                </div>
                <div className={styles.fact}>
                  <dt>{l.quota}</dt>
                  <dd>
                    <StatusChip value={s.quotaState} />
                  </dd>
                </div>
              </dl>
              {s.rescheduledFromSessionId && (
                <p className={styles.muted}>{l.rescheduledFrom}</p>
              )}

              <p className={late ? styles.alertNote : styles.muted}>
                {!scheduled ? l.ruleClosed : late ? l.ruleLate : l.ruleFree}
              </p>

              {pending && (
                <p className={styles.alertNote} role="status">
                  {l.pendingNote}
                </p>
              )}

              {canRequest && !open && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setOpen(true)}
                >
                  {l.requestChange}
                </button>
              )}

              {canRequest && open && (
                <form
                  className={styles.panel}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  <fieldset className={styles.choice}>
                    <label>
                      <input
                        type="radio"
                        name="kind"
                        checked={kind === "CANCEL"}
                        onChange={() => setKind("CANCEL")}
                      />
                      {l.cancelThisSession}
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="kind"
                        checked={kind === "RESCHEDULE"}
                        onChange={() => setKind("RESCHEDULE")}
                      />
                      {l.moveThisSession}
                    </label>
                  </fieldset>
                  {kind === "RESCHEDULE" && (
                    <Field label={l.newTime}>
                      <input
                        type="datetime-local"
                        required
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                      />
                    </Field>
                  )}
                  <Field label={l.reason}>
                    <textarea
                      maxLength={2000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </Field>
                  {late && (
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={exception}
                        onChange={(e) => setException(e.target.checked)}
                      />{" "}
                      {l.askException}
                    </label>
                  )}
                  <div className="btn-row">
                    <button
                      type="submit"
                      className="btn"
                      disabled={
                        action.busy || (kind === "RESCHEDULE" && !start)
                      }
                    >
                      {l.sendRequest}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => setOpen(false)}
                    >
                      {l.closeForm}
                    </button>
                  </div>
                </form>
              )}
              <Feedback error={action.error} success={action.success} />

              <div className={styles.section}>
                <h2>{l.requestsHere}</h2>
                <AsyncSection state={requests}>
                  {() => (
                    <RequestList requests={mine} empty={l.noRequestsHere} />
                  )}
                </AsyncSection>
              </div>
            </>
          );
        }}
      </AsyncSection>
    </div>
  );
}

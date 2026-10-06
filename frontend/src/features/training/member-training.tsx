"use client";
import { findSportWithService } from "@/lib/sports";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi, useAction } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { Card, StatusChip } from "@/components/ui";
import type {
  WorkoutPlanDto,
  WorkoutResultDto,
  SportDto,
  HomeworkDto as Homework,
  PtSessionDto as PtSession,
  PtChangeRequestDto as Change,
} from "@/lib/types";
function HomeworkCard({
  homework: h,
  reload,
}: {
  homework: Homework;
  reload: () => void;
}) {
  const { t } = useLanguage();
  const [feedback, setFeedback] = useState(h.memberFeedback ?? "");
  const action = useAction();
  return (
    <Card title={h.title}>
      <p>
        {h.coachName} · <StatusChip value={h.status} /> ·{" "}
        {formatDateTime(h.dueAt)}
      </p>
      <p>{h.coachNote}</p>
      <ul>
        {h.items.map((i) => (
          <li key={i.itemId}>
            {i.exercise} · {i.sets} × {i.reps} · {i.notes}
          </li>
        ))}
      </ul>
      {!["REVIEWED", "CANCELLED"].includes(h.status) && (
        <>
          <label>
            {t.refactor.feedback}
            <textarea
              maxLength={2000}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>
          <button
            className="btn btn--secondary"
            disabled={action.busy}
            onClick={() =>
              action.run(async () => {
                await api.patch(`/api/members/me/homework/${h.assignmentId}`, {
                  status: "COMPLETED",
                  memberFeedback: feedback,
                  version: h.version,
                });
                reload();
              })
            }
          >
            {t.refactor.done}
          </button>
        </>
      )}
      {action.error && <p role="alert">{action.error}</p>}
    </Card>
  );
}
function SessionCard({
  session: s,
  reload,
}: {
  session: PtSession;
  reload: () => void;
}) {
  const { t } = useLanguage();
  const [reason, setReason] = useState("");
  const [start, setStart] = useState("");
  const [exception, setException] = useState(false);
  const action = useAction();
  async function submit(requestType: "CANCEL" | "RESCHEDULE") {
    await action.run(async () => {
      await api.post(
        `/api/members/me/pt-sessions/${s.sessionId}/change-requests`,
        {
          requestType,
          reason,
          requestsException: exception,
          requestedStartAtUtc:
            requestType === "RESCHEDULE"
              ? new Date(`${start}+07:00`).toISOString()
              : null,
        },
      );
      reload();
    });
  }
  return (
    <Card title={s.coachName}>
      <p>
        {formatDateTime(s.startAtUtc)} – {formatDateTime(s.endAtUtc)} ·{" "}
        {s.roomName} · <StatusChip value={s.status} /> ·{" "}
        <StatusChip value={s.quotaState} />
      </p>
      {s.rescheduledFromSessionId && <p>↪ {s.rescheduledFromSessionId}</p>}
      {s.status === "SCHEDULED" && (
        <>
          <label>
            {t.refactor.reason}
            <textarea
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label>
            {t.refactor.reschedule} (UTC+07:00)
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={exception}
              onChange={(e) => setException(e.target.checked)}
            />
            {t.refactor.exception}
          </label>
          <button
            className="btn btn--secondary"
            disabled={action.busy}
            onClick={() => submit("CANCEL")}
          >
            {t.refactor.cancelSession}
          </button>
          <button
            className="btn btn--secondary"
            disabled={action.busy || !start}
            onClick={() => submit("RESCHEDULE")}
          >
            {t.refactor.reschedule}
          </button>
        </>
      )}
      {action.error && <p role="alert">{action.error}</p>}
    </Card>
  );
}
function CoachChange({ reload }: { reload: () => void }) {
  const { t } = useLanguage();
  const [entitlementId, setEntitlement] = useState("");
  const [coachId, setCoach] = useState("");
  const [reason, setReason] = useState("");
  const action = useAction();
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { signal, anonymous: true }),
    [],
  );
  const pt = findSportWithService(sports.data, "PERSONAL_TRAINING");
  const coaches = useApi(
    (signal) =>
      pt
        ? api.get<{ userId: string; fullName: string }[]>("/api/coaches", {
            signal,
            query: { service: "PERSONAL_TRAINING" },
          })
        : Promise.resolve([]),
    [pt?.sportId],
  );
  const entitlements = useApi(
    (signal) =>
      api.get<
        {
          entitlementId: string;
          coachId: string;
          coachName: string;
          status: string;
        }[]
      >("/api/members/me/pt-entitlements", { signal }),
    [],
  );
  return (
    <Card title={t.refactor.requests}>
      <label>
        {t.refactor.pt}
        <select
          value={entitlementId}
          onChange={(e) => setEntitlement(e.target.value)}
        >
          <option value="">—</option>
          {entitlements.data
            ?.filter((e) => e.status === "ACTIVE")
            .map((e) => (
              <option key={e.entitlementId} value={e.entitlementId}>
                {e.coachName}
              </option>
            ))}
        </select>
      </label>
      <label>
        {t.refactor.coach}
        <select value={coachId} onChange={(e) => setCoach(e.target.value)}>
          <option value="">—</option>
          {coaches.data
            ?.filter(
              (c) =>
                c.userId !==
                entitlements.data?.find(
                  (e) => e.entitlementId === entitlementId,
                )?.coachId,
            )
            .map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.fullName}
              </option>
            ))}
        </select>
      </label>
      <label>
        {t.refactor.reason}
        <textarea
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {coaches.error && <p role="alert">{coaches.error.message}</p>}
      {entitlements.error && <p role="alert">{entitlements.error.message}</p>}
      {action.error && <p role="alert">{action.error}</p>}
      <button
        className="btn btn--secondary"
        disabled={action.busy || !entitlementId || !coachId}
        onClick={() =>
          action.run(async () => {
            await api.post(
              `/api/members/me/pt-entitlements/${entitlementId}/coach-change-requests`,
              { requestedCoachId: coachId, reason },
            );
            reload();
          })
        }
      >
        {t.refactor.send}
      </button>
    </Card>
  );
}
export function MemberTraining() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const data = useApi(
    async (signal) => {
      const options = { signal, query: { page, pageSize: 20 } };
      const [
        plans,
        results,
        homework,
        sessions,
        sessionChanges,
        coachChanges,
        relationships,
      ] = await Promise.all([
        api.get<WorkoutPlanDto[]>("/api/members/me/workout-plans", options),
        api.get<WorkoutResultDto[]>("/api/members/me/workout-results", options),
        api.get<Homework[]>("/api/members/me/homework", options),
        api.get<PtSession[]>("/api/members/me/pt-sessions", options),
        api.get<Change[]>("/api/members/me/pt-session-change-requests", {
          signal,
        }),
        api.get<Change[]>("/api/members/me/pt-coach-change-requests", {
          signal,
        }),
        api.get<
          { relationshipId: string; coachName: string; status: string }[]
        >("/api/coach-member-relationships", { signal }),
      ]);
      return {
        plans,
        results,
        homework,
        sessions,
        sessionChanges,
        coachChanges,
        relationships,
      };
    },
    [page],
  );
  const d = data.data;
  return (
    <>
      <button onClick={data.reload}>{t.refactor.refresh}</button>
      {data.loading ? (
        <p>{t.refactor.loading}</p>
      ) : data.error ? (
        <p role="alert">{data.error.message}</p>
      ) : (
        d && (
          <>
            <Card title={t.refactor.coach}>
              {!d.relationships.length ? (
                <p>{t.refactor.empty}</p>
              ) : (
                d.relationships.map((r) => (
                  <p key={r.relationshipId}>
                    {r.coachName} · <StatusChip value={r.status} />
                  </p>
                ))
              )}
            </Card>
            {d.plans.map((p) => (
              <Card key={p.planId} title={p.goal}>
                <p>
                  {p.coachName} · {p.level}
                </p>
                <ul>
                  {p.items.map((i) => (
                    <li key={i.itemId}>
                      {i.exercise} · {i.sets} × {i.reps} · {i.notes}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
            {d.results.map((r) => (
              <Card
                key={r.resultId}
                title={formatDateTime(r.sessionStartAtUtc)}
              >
                <p>
                  {r.coachName} · {r.progressNote} · {r.coachComment}
                </p>
              </Card>
            ))}
            {d.homework.map((h) => (
              <HomeworkCard
                key={`${h.assignmentId}-${h.version}`}
                homework={h}
                reload={data.reload}
              />
            ))}
            {d.sessions.map((s) => (
              <SessionCard key={s.sessionId} session={s} reload={data.reload} />
            ))}
            <Card title={t.refactor.requests}>
              {[...d.sessionChanges, ...d.coachChanges].map((r) => (
                <p key={r.requestId}>
                  {r.requestType ?? r.requestedCoachName} ·{" "}
                  <StatusChip value={r.status} /> ·{" "}
                  <StatusChip value={r.timingClassification} /> · {r.reason} ·{" "}
                  {r.reviewNote}
                  {r.requestedStartAtUtc &&
                    ` · ${formatDateTime(r.requestedStartAtUtc)}`}
                </p>
              ))}
            </Card>
            <CoachChange reload={data.reload} />
            {!d.plans.length &&
              !d.results.length &&
              !d.homework.length &&
              !d.sessions.length && <p>{t.refactor.empty}</p>}
          </>
        )
      )}
      <button
        className="btn btn--secondary"
        disabled={page === 1}
        onClick={() => setPage(page - 1)}
      >
        {t.refactor.previous}
      </button>
      <button
        className="btn btn--secondary"
        disabled={
          !d ||
          Math.max(
            d.plans.length,
            d.results.length,
            d.homework.length,
            d.sessions.length,
          ) < 20
        }
        onClick={() => setPage(page + 1)}
      >
        {t.refactor.more}
      </button>
    </>
  );
}

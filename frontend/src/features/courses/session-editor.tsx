"use client";
import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { api, ApiError } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { Card, Field, AsyncSection } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { vietnamLocal, vietnamUtc } from "@/lib/vietnam-time";
import { RoomSelector } from "@/features/catalog";
import { CoachSelector } from "@/features/coaches";
import type { CourseSessionDto } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { checkClassSlot, availabilityReason } from "./slot-availability";

function SessionChangeReview({
  session,
  sportId,
  capacity,
  start,
  roomId,
  coachId,
  reason,
  mode,
  busy,
  onConfirm,
  onEdit,
}: {
  session: CourseSessionDto;
  sportId: number;
  capacity: number;
  start: string;
  roomId: string;
  coachId: string;
  reason: string;
  mode: string;
  busy: boolean;
  onConfirm: () => Promise<boolean>;
  onEdit: () => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const startUtc = vietnamUtc(start);
  const endUtc = new Date(
    Date.parse(startUtc) +
      Date.parse(session.endAtUtc) -
      Date.parse(session.startAtUtc),
  ).toISOString();
  const state = useApi(
    (signal) =>
      checkClassSlot(
        {
          sportId,
          roomId: Number(roomId),
          coachId,
          capacity,
          startUtc,
          endUtc,
          excludeSessionId: session.sessionId,
        },
        signal,
      ),
    [session.sessionId, sportId, roomId, coachId, capacity, startUtc, endUtc],
  );
  return (
    <div className="stack">
      <p>
        <strong>{t.managerOperations.oldSchedule}</strong>:{" "}
        {formatDateTime(session.startAtUtc)} –{" "}
        {formatDateTime(session.endAtUtc)} · {session.roomName} ·{" "}
        {session.coachName}
      </p>
      <AsyncSection state={state}>
        {(result) => (
          <>
            <p>
              <strong>{t.managerOperations.newSchedule}</strong>:{" "}
              {formatDateTime(startUtc)} – {formatDateTime(endUtc)} ·{" "}
              {result.roomName || t.managerAudit.nameUnavailable} ·{" "}
              {result.coachName || t.managerAudit.nameUnavailable}
            </p>
            <p>
              {mode === "reschedule" ? l.reschedule : l.makeup} · {reason}
            </p>
            <p role="status">{result.available ? l.available : l.conflict}</p>
            {result.reasons.length > 0 && (
              <ul>
                {result.reasons.map((code) => (
                  <li key={code}>{availabilityReason(code, t)}</li>
                ))}
              </ul>
            )}
            <p className="small muted">
              {t.managerOperations.previewConfirmationHint}
            </p>
            <button
              type="button"
              className="btn"
              disabled={busy || !result.available}
              onClick={async () => {
                if (!(await onConfirm())) state.reload();
              }}
            >
              {l.confirm}
            </button>
          </>
        )}
      </AsyncSection>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn--secondary"
          disabled={busy}
          onClick={onEdit}
        >
          {t.managerOperations.editReview}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy || state.loading}
          onClick={state.reload}
        >
          {l.refresh}
        </button>
      </div>
    </div>
  );
}
export function SessionEditor({
  session,
  sportId,
  capacity,
  onSaved,
  onClose,
  onOutcome,
}: {
  session: CourseSessionDto;
  sportId: number;
  capacity: number;
  onSaved: () => void;
  onClose: () => void;
  onOutcome?: (
    status: "pending" | "succeeded" | "failed" | "unknown",
    message?: string,
  ) => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const mutation = useMutation();
  const [mode, setMode] = useState("reschedule");
  const [start, setStart] = useState(vietnamLocal(session.startAtUtc));
  const [roomId, setRoom] = useState(String(session.roomId));
  const [coachId, setCoach] = useState(session.coachId);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const busy = mutation.busy || (unknown && !!onOutcome);
  return (
    <Card title={l.sessions}>
      <p>{l.notifyHint}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!review) {
            setReview(true);
          }
        }}
      >
        <fieldset disabled={busy} hidden={review}>
          <Field label={l.edit}>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="reschedule">{l.reschedule}</option>
              <option value="cancel">{l.makeup}</option>
            </select>
          </Field>
          <Field label={l.start}>
            <input
              required
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <RoomSelector sportId={sportId} value={roomId} onChange={setRoom} />
          <CoachSelector
            sportId={sportId}
            value={coachId}
            onChange={setCoach}
          />
          <Field label={l.reason}>
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </fieldset>
        {review && (
          <SessionChangeReview
            session={session}
            sportId={sportId}
            capacity={capacity}
            start={start}
            roomId={roomId}
            coachId={coachId}
            reason={reason}
            mode={mode}
            busy={busy}
            onEdit={() => setReview(false)}
            onConfirm={async () => {
              const schedule = {
                startAtUtc: vietnamUtc(start),
                roomId: Number(roomId),
                coachId,
              };
              onOutcome?.("pending");
              const success = await mutation.run(async () => {
                try {
                  await api.post(
                    `/api/class-sessions/${session.sessionId}/${mode === "reschedule" ? "reschedule" : "cancel"}`,
                    mode === "reschedule"
                      ? { ...schedule, reason }
                      : { reason, makeup: schedule },
                  );
                } catch (error) {
                  const uncertain =
                    !(error instanceof ApiError) ||
                    error.status === 0 ||
                    error.status >= 500;
                  setUnknown(uncertain);
                  onOutcome?.(
                    uncertain ? "unknown" : "failed",
                    error instanceof Error ? error.message : undefined,
                  );
                  throw error;
                }
              });
              if (success) {
                onOutcome?.("succeeded");
                onSaved();
              }
              return success;
            }}
          />
        )}
        <div className="btn-row">
          {!review && (
            <button
              className="btn"
              disabled={
                busy ||
                !roomId ||
                !coachId ||
                !start ||
                reason.trim().length < 3
              }
            >
              {t.managerOperations.reviewChange}
            </button>
          )}
          <button
            type="button"
            className="btn btn--secondary"
            disabled={mutation.busy}
            onClick={onClose}
          >
            {l.close}
          </button>
        </div>
      </form>
      <MutationFeedback mutation={mutation} />
    </Card>
  );
}

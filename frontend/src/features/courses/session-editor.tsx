"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { Card, Field } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { vietnamLocal, vietnamUtc } from "@/lib/vietnam-time";
import { RoomSelector } from "@/features/catalog";
import { CoachSelector } from "@/features/coaches";
import type { CourseSessionDto } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
export function SessionEditor({
  session,
  sportId,
  onSaved,
  onClose,
}: {
  session: CourseSessionDto;
  sportId: number;
  onSaved: () => void;
  onClose: () => void;
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
  return (
    <Card title={l.sessions}>
      <p>{l.notifyHint}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!review) {
            setReview(true);
            return;
          }
          const schedule = {
            startAtUtc: vietnamUtc(start),
            roomId: roomId ? Number(roomId) : null,
            coachId: coachId || null,
          };
          if (
            await mutation.run(() =>
              api.post(
                `/api/class-sessions/${session.sessionId}/${mode === "reschedule" ? "reschedule" : "cancel"}`,
                mode === "reschedule"
                  ? { ...schedule, reason }
                  : { reason, makeup: schedule },
              ),
            )
          )
            onSaved();
        }}
      >
        <fieldset disabled={mutation.busy} hidden={review}>
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
          <div className="stack">
            <p>
              <strong>{t.managerOperations.oldSchedule}</strong>:{" "}
              {formatDateTime(session.startAtUtc)} · {session.roomName} ·{" "}
              {session.coachName}
            </p>
            <p>
              <strong>{t.managerOperations.newSchedule}</strong>:{" "}
              {formatDateTime(vietnamUtc(start))} · #{roomId} · {coachId}
            </p>
            <p>
              {mode === "reschedule" ? l.reschedule : l.makeup} · {reason}
            </p>
            <p>{t.managerOperations.serverConflict}</p>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={mutation.busy}
              onClick={() => setReview(false)}
            >
              {t.managerOperations.editReview}
            </button>
          </div>
        )}
        <div className="btn-row">
          <button
            className="btn"
            disabled={
              mutation.busy ||
              !roomId ||
              !coachId ||
              !start ||
              reason.trim().length < 3
            }
          >
            {review ? l.confirm : t.managerOperations.reviewChange}
          </button>
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

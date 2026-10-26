"use client";
import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { api, ApiError } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { Card, Field, AsyncSection } from "@/components/ui";
import { CloseButton } from "@/components/CloseButton";
import { IconCheck, IconAlert } from "@/components/icons";
import { MutationFeedback, useMutation } from "@/features/operations";
import { vietnamLocal, vietnamUtc } from "@/lib/vietnam-time";
import { RoomSelector, catalogApi } from "@/features/catalog";
import { ClassWeekSchedule } from "./class-week-schedule";
import { CoachSelector } from "@/features/coaches";
import type { CourseSessionDto } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { checkClassSlot, availabilityReason } from "./slot-availability";
import styles from "./session-editor.module.css";

function SessionWeekSchedule({
  session,
  start,
  roomId,
  coachId,
}: {
  session: CourseSessionDto;
  start: string;
  roomId: string;
  coachId: string;
}) {
  const rooms = useApi((signal) => catalogApi.rooms(signal), []);
  const selectedStart = start || vietnamLocal(session.startAtUtc);
  const startAtUtc = vietnamUtc(selectedStart);
  const endAtUtc = new Date(
    Date.parse(startAtUtc) +
      Date.parse(session.endAtUtc) -
      Date.parse(session.startAtUtc),
  ).toISOString();
  const date = selectedStart.slice(0, 10);
  return (
    <AsyncSection state={rooms}>
      {(items) => (
        <ClassWeekSchedule
          key={date}
          startDate={date}
          coachId={coachId}
          roomId={Number(roomId)}
          rooms={items}
          excludeSessionId={session.sessionId}
          draftSessions={[{ startAtUtc, endAtUtc }]}
        />
      )}
    </AsyncSection>
  );
}

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
  compact = false,
  showReviewActions = true,
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
  compact?: boolean;
  showReviewActions?: boolean;
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
    <div className={compact ? styles.compactReview : "stack"}>
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
              {result.roomName || `#${roomId}`} ·{" "}
              {result.coachName || `#${coachId}`}
            </p>
            {!compact && (
              <p>
                {mode === "reschedule" ? l.reschedule : l.makeup} · {reason}
              </p>
            )}
            <div
              role="status"
              className={
                compact
                  ? `${styles.availability} ${result.available ? styles.available : styles.conflict}`
                  : undefined
              }
            >
              <p className={compact ? styles.statusTitle : undefined}>
                {compact &&
                  (result.available ? (
                    <IconCheck size={20} strokeWidth={2} />
                  ) : (
                    <IconAlert size={20} strokeWidth={2} />
                  ))}
                {compact ? (
                  <strong>{result.available ? l.available : l.conflict}</strong>
                ) : result.available ? (
                  l.available
                ) : (
                  l.conflict
                )}
              </p>
              {result.reasons.length > 0 && (
                <ul>
                  {result.reasons.map((code) => (
                    <li key={code}>{availabilityReason(code, t)}</li>
                  ))}
                </ul>
              )}
            </div>
            {!compact && (
              <p className="small muted">
                {t.managerOperations.previewConfirmationHint}
              </p>
            )}
            {compact && showReviewActions && (
              <div className="btn-row">
                <button
                  type="button"
                  className={`btn ${styles.managerSecondary}`}
                  disabled={busy}
                  onClick={onEdit}
                >
                  {t.managerOperations.editReview}
                </button>
              </div>
            )}
            <button
              type="button"
              className={compact ? `btn ${styles.managerPrimary}` : "btn"}
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
      {!compact && showReviewActions && (
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={onEdit}
          >
            {t.managerOperations.editReview}
          </button>
        </div>
      )}
    </div>
  );
}
export function SessionEditor({
  session,
  sportId,
  capacity,
  onSaved,
  confirmedCount,
  onClose,
  onOutcome,
  showCloseButton = true,
  embedded = false,
  showReviewActions = true,
  beforeSave,
  showWeeklySchedule = false,
  incidentFence,
  initialMode = "reschedule",
}: {
  session: CourseSessionDto;
  sportId: number;
  capacity: number;
  onSaved: () => void;
  confirmedCount: number;
  onClose: () => void;
  showCloseButton?: boolean;
  embedded?: boolean;
  showReviewActions?: boolean;
  showWeeklySchedule?: boolean;
  incidentFence?: () => Promise<string>;
  initialMode?: "reschedule" | "cancel";
  beforeSave?: () => Promise<void>;
  onOutcome?: (
    status: "pending" | "succeeded" | "failed" | "unknown",
    message?: string,
  ) => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const mutation = useMutation();
  const [requestedMode, setMode] = useState<string>(initialMode);
  const mode = incidentFence
    ? "cancel"
    : confirmedCount > 0
      ? "reschedule"
      : requestedMode;
  const [start, setStart] = useState(vietnamLocal(session.startAtUtc));
  const [roomId, setRoom] = useState(String(session.roomId));
  const [coachId, setCoach] = useState(session.coachId);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const busy = mutation.busy || (unknown && !!onOutcome);
  const content = (
    <>
      {!embedded && <p>{l.notifyHint}</p>}
      <form
        className={embedded ? styles.form : undefined}
        onSubmit={(e) => {
          e.preventDefault();
          if (!review) {
            setReview(true);
          }
        }}
      >
        <div
          data-weekly-editor={(!review && showWeeklySchedule) || undefined}
          className={
            !review && showWeeklySchedule ? styles.editorLayout : undefined
          }
        >
          <fieldset
            disabled={busy}
            hidden={review}
            className={embedded ? styles.fields : undefined}
          >
            {incidentFence && (
              <div className={styles.incidentMakeup}>
                <strong>{t.classSessions.incidentMakeupTitle}</strong>
                <p>{t.classSessions.incidentMakeupHint}</p>
              </div>
            )}
            {confirmedCount === 0 && !incidentFence && (
              <Field label={l.edit}>
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="reschedule">{l.reschedule}</option>
                  <option value="cancel">{l.makeup}</option>
                </select>
              </Field>
            )}
            <Field
              label={incidentFence ? t.classSessions.makeupStart : l.start}
            >
              <input
                required
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <div className={embedded ? styles.resources : undefined}>
              <RoomSelector
                sportId={sportId}
                value={roomId}
                onChange={setRoom}
              />
              <CoachSelector
                sportId={sportId}
                value={coachId}
                onChange={setCoach}
              />
            </div>
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
          {!review && showWeeklySchedule && (
            <div className={styles.weekSchedule}>
              <SessionWeekSchedule
                session={session}
                start={start}
                roomId={roomId}
                coachId={coachId}
              />
            </div>
          )}
        </div>
        {review && (
          <SessionChangeReview
            compact={embedded}
            showReviewActions={showReviewActions}
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
                  await beforeSave?.();
                  const fenceId =
                    mode === "cancel" && incidentFence
                      ? await incidentFence()
                      : undefined;
                  await api.post(
                    `/api/class-sessions/${session.sessionId}/${mode === "reschedule" ? "reschedule" : incidentFence ? "incident-makeup" : "cancel"}`,
                    mode === "reschedule"
                      ? { ...schedule, reason }
                      : { reason, makeup: schedule, fenceId },
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
        {(!review || showCloseButton) && (
          <div className={embedded ? `btn-row ${styles.actions}` : "btn-row"}>
            {!review && (
              <button
                className={embedded ? `btn ${styles.managerPrimary}` : "btn"}
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
            {showCloseButton && (
              <CloseButton
                label={l.close}
                variant="secondary"
                size="md"
                disabled={mutation.busy}
                onClick={onClose}
              />
            )}
          </div>
        )}
      </form>
      <MutationFeedback mutation={mutation} />
    </>
  );
  return embedded ? content : <Card title={l.sessions}>{content}</Card>;
}

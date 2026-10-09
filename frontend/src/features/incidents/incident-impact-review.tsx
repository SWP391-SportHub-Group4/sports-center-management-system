"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { Card, Table, Field, AsyncSection, Dialog } from "@/components/ui";
import { RoomSelector, catalogApi } from "@/features/catalog";
import { useOperationsCopy } from "@/features/manager";
import { SessionEditor } from "@/features/courses";
import { MutationFeedback, useMutation } from "@/features/operations";
import { vietnamUtc, vietnamLocal } from "@/lib/vietnam-time";
import type { StepStatus } from "./incident-progress";
import type {
  IncidentPreviewDto,
  CourseSessionDto,
  ManagerCourseDto,
  CourtScheduleEntryDto,
} from "@/lib/types";
function ClassImpactEditor({
  id,
  onSaved,
  onClose,
  onOutcome,
}: {
  id: string;
  onSaved: () => void;
  onClose: () => void;
  onOutcome: (status: StepStatus, message?: string) => void;
}) {
  const state = useApi(
    async (signal) => {
      const session = await api.get<CourseSessionDto>(
        `/api/class-sessions/${id}`,
        { signal },
      );
      const course = await api.get<ManagerCourseDto>(
        `/api/manager/classes/${session.classId}`,
        { signal },
      );
      return { session, sportId: course.sportId, capacity: course.capacity };
    },
    [id],
  );
  return (
    <AsyncSection state={state}>
      {(data) => (
        <SessionEditor
          session={data.session}
          sportId={data.sportId}
          capacity={data.capacity}
          onSaved={onSaved}
          onClose={onClose}
          onOutcome={onOutcome}
        />
      )}
    </AsyncSection>
  );
}
function PtImpactEditor({
  id,
  onSaved,
  onOutcome,
  onClose,
}: {
  id: string;
  onSaved: () => void;
  onOutcome: (status: StepStatus, message?: string) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const [cancel, setCancel] = useState(false);
  const [start, setStart] = useState("");
  const [roomId, setRoom] = useState("");
  const [reason, setReason] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const mutation = useMutation();
  const [unknown, setUnknown] = useState(false);
  return (
    <Card title={l.ptSession}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (reason.trim().length < 3) return;
          if (!reviewing) {
            setReviewing(true);
            return;
          }
          if (unknown || mutation.busy) return;
          onOutcome("pending");
          if (
            await mutation.run(async () => {
              try {
                await api.post(
                  `/api/manager/pt-sessions/${id}/${cancel ? "cancel" : "reschedule"}`,
                  cancel
                    ? { reason }
                    : {
                        reason,
                        newStartAtUtc: vietnamUtc(start),
                        roomId: roomId ? Number(roomId) : null,
                      },
                );
              } catch (error) {
                const uncertain =
                  !(error instanceof ApiError) ||
                  error.status === 0 ||
                  error.status >= 500;
                setUnknown(uncertain);
                onOutcome(
                  uncertain ? "unknown" : "failed",
                  error instanceof Error ? error.message : undefined,
                );
                throw error;
              }
            })
          ) {
            onOutcome("succeeded");
            onSaved();
          }
        }}
      >
        <fieldset disabled={mutation.busy || unknown} hidden={reviewing}>
          <Field label={l.edit}>
            <select
              value={cancel ? "cancel" : "reschedule"}
              onChange={(e) => setCancel(e.target.value === "cancel")}
            >
              <option value="reschedule">{l.reschedule}</option>
              <option value="cancel">{l.cancel}</option>
            </select>
          </Field>
          {!cancel && (
            <>
              <Field label={l.start}>
                <input
                  required
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <RoomSelector value={roomId} onChange={setRoom} />
            </>
          )}
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
        {reviewing && (
          <div className="stack">
            <p>
              {cancel ? l.cancel : l.reschedule} · <code>{id}</code>
            </p>
            {!cancel && (
              <p>
                {formatDateTime(vietnamUtc(start))} · {l.room}: {roomId || "—"}
              </p>
            )}
            <p>{reason}</p>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={mutation.busy || unknown}
              onClick={() => setReviewing(false)}
            >
              {l.previous}
            </button>
          </div>
        )}
        <button className="btn" disabled={mutation.busy || unknown}>
          {reviewing ? l.confirm : l.review}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={mutation.busy}
          onClick={onClose}
        >
          {l.close}
        </button>
      </form>
      <MutationFeedback mutation={mutation} />
    </Card>
  );
}
export function IncidentImpactReview({
  preview,
  onRefresh,
  onCompleted,
  onResult,
  onEditingChange,
  disabled = false,
}: {
  preview: IncidentPreviewDto;
  onRefresh: () => void;
  onCompleted?: (type: string, id: string) => void;
  onResult?: (
    type: string,
    id: string,
    status: StepStatus,
    message?: string,
  ) => void;
  onEditingChange?: (editing: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const c = useOperationsCopy();
  const [editing, setEditing] = useState<{ type: string; id: string } | null>(
    null,
  );
  const mutation = useMutation();
  const [removeId, setRemoveId] = useState("");
  const details = useApi(
    async (signal) => {
      if (!preview.startAtUtc || !preview.endAtUtc) return null;
      const [entries, rooms] = await Promise.all([
        api.get<CourtScheduleEntryDto[]>("/api/manager/court-schedule", {
          signal,
          query: {
            fromDate: vietnamLocal(preview.startAtUtc).slice(0, 10),
            toDate: vietnamLocal(preview.endAtUtc).slice(0, 10),
          },
        }),
        catalogApi.rooms(signal),
      ]);
      return { entries, rooms };
    },
    [
      preview.startAtUtc,
      preview.endAtUtc,
      preview.impacts.map((r) => r.sourceId).join(","),
    ],
  );
  function closeEditor() {
    setEditing(null);
    onEditingChange?.(false);
  }
  const labels: Record<string, string> = {
    CLASS_SESSION: l.classSession,
    PT_SESSION: l.ptSession,
    COURT_RENTAL: l.rental,
    ROOM_BLOCK: l.roomBlock,
  };
  return (
    <>
      <p>{preview.blockReason}</p>
      <p>
        {c.impactCount}: {preview.impacts.length}
      </p>
      {details.error && (
        <p role="status">
          {c.detailsUnavailable}{" "}
          <button className="btn btn--ghost" onClick={details.reload}>
            {l.refresh}
          </button>
        </p>
      )}
      {!preview.impacts.length && <p>{c.emptyImpacts}</p>}
      <Table
        headers={[
          l.impact,
          t.managerOperations.receiptId,
          l.room,
          l.coach,
          l.start,
          l.end,
          "",
        ]}
      >
        {preview.impacts.map((r) => {
          const entry = details.data?.entries.find(
            (e) => e.sourceType === r.sourceType && e.sourceId === r.sourceId,
          );
          return (
            <tr key={`${r.sourceType}-${r.sourceId}`}>
              <td>
                {labels[r.sourceType] ?? r.sourceType}
                {entry && <p>{entry.title}</p>}
              </td>
              <td>
                <code>{r.sourceId}</code>
              </td>
              <td>
                {details.data?.rooms.find(
                  (room) => room.roomId === entry?.roomId,
                )?.name || "—"}
              </td>
              <td>{entry?.coachName || "—"}</td>
              <td>{formatDateTime(r.startAtUtc)}</td>
              <td>{formatDateTime(r.endAtUtc)}</td>
              <td>
                {r.sourceType === "CLASS_SESSION" ||
                r.sourceType === "PT_SESSION" ? (
                  <button
                    className="btn btn--secondary"
                    disabled={disabled || !!editing || !!removeId}
                    onClick={() => {
                      setEditing({ type: r.sourceType, id: r.sourceId });
                      onEditingChange?.(true);
                    }}
                  >
                    {l.edit}
                  </button>
                ) : r.sourceType === "ROOM_BLOCK" &&
                  r.resolutionOptions.some(
                    (o) => o.action === "RemoveExistingBlock",
                  ) ? (
                  <button
                    className="btn btn--secondary"
                    disabled={
                      disabled || mutation.busy || !!editing || !!removeId
                    }
                    onClick={() => {
                      setRemoveId(r.sourceId);
                      onEditingChange?.(true);
                    }}
                  >
                    {l.remove}
                  </button>
                ) : (
                  <span>
                    {r.sourceType === "COURT_RENTAL"
                      ? entry?.status === "PENDING_PAYMENT"
                        ? c.rentalPending
                        : c.rentalConfirmed
                      : c.blockUnsupported}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
      {removeId && (
        <Dialog
          title={l.remove}
          onClose={() => {
            if (!mutation.busy) {
              setRemoveId("");
              onEditingChange?.(false);
            }
          }}
        >
          <p>
            {l.roomBlock} · <code>{removeId}</code>
          </p>
          <p>{t.managerOperations.partialHint}</p>
          <div className="btn-row">
            <button
              className="btn"
              disabled={mutation.busy || disabled}
              onClick={async () => {
                onResult?.("ROOM_BLOCK", removeId, "pending");
                if (
                  await mutation.run(async () => {
                    try {
                      await api.del(`/api/manager/room-blocks/${removeId}`);
                    } catch (error) {
                      onResult?.(
                        "ROOM_BLOCK",
                        removeId,
                        !(error instanceof ApiError) ||
                          error.status === 0 ||
                          error.status >= 500
                          ? "unknown"
                          : "failed",
                        error instanceof Error ? error.message : undefined,
                      );
                      throw error;
                    }
                  })
                ) {
                  onResult?.("ROOM_BLOCK", removeId, "succeeded");
                  onCompleted?.("ROOM_BLOCK", removeId);
                  setRemoveId("");
                  onEditingChange?.(false);
                  onRefresh();
                }
              }}
            >
              {l.confirm}
            </button>
            <button
              className="btn btn--secondary"
              disabled={mutation.busy}
              onClick={() => {
                setRemoveId("");
                onEditingChange?.(false);
              }}
            >
              {l.close}
            </button>
          </div>
          <MutationFeedback mutation={mutation} />
        </Dialog>
      )}
      {editing?.type === "CLASS_SESSION" && (
        <ClassImpactEditor
          key={editing.id}
          id={editing.id}
          onOutcome={(status, message) =>
            onResult?.("CLASS_SESSION", editing.id, status, message)
          }
          onSaved={() => {
            onCompleted?.("CLASS_SESSION", editing.id);
            closeEditor();
            onRefresh();
          }}
          onClose={closeEditor}
        />
      )}
      {editing?.type === "PT_SESSION" && (
        <PtImpactEditor
          key={editing.id}
          id={editing.id}
          onOutcome={(status, message) =>
            onResult?.("PT_SESSION", editing.id, status, message)
          }
          onClose={closeEditor}
          onSaved={() => {
            onCompleted?.("PT_SESSION", editing.id);
            closeEditor();
            onRefresh();
          }}
        />
      )}
      <MutationFeedback mutation={mutation} />
    </>
  );
}

"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { Card, Table, Field, AsyncSection, Dialog } from "@/components/ui";
import { RoomSelector } from "@/features/catalog";
import { SessionEditor } from "@/features/courses";
import { MutationFeedback, useMutation } from "@/features/operations";
import { vietnamUtc } from "@/lib/vietnam-time";
import type {
  IncidentPreviewDto,
  CourseSessionDto,
  ManagerCourseDto,
} from "@/lib/types";
function ClassImpactEditor({
  id,
  onSaved,
  onClose,
}: {
  id: string;
  onSaved: () => void;
  onClose: () => void;
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
        />
      )}
    </AsyncSection>
  );
}
function PtImpactEditor({ id, onSaved }: { id: string; onSaved: () => void }) {
  const { t } = useLanguage();
  const l = t.operations;
  const [cancel, setCancel] = useState(false);
  const [start, setStart] = useState("");
  const [roomId, setRoom] = useState("");
  const [reason, setReason] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const mutation = useMutation();
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
          if (
            await mutation.run(() =>
              api.post(
                `/api/manager/pt-sessions/${id}/${cancel ? "cancel" : "reschedule"}`,
                cancel
                  ? { reason }
                  : {
                      reason,
                      newStartAtUtc: vietnamUtc(start),
                      roomId: roomId ? Number(roomId) : null,
                    },
              ),
            )
          )
            onSaved();
        }}
      >
        <fieldset disabled={mutation.busy} hidden={reviewing}>
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
              disabled={mutation.busy}
              onClick={() => setReviewing(false)}
            >
              {l.previous}
            </button>
          </div>
        )}
        <button className="btn" disabled={mutation.busy}>
          {reviewing ? l.confirm : l.review}
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
}: {
  preview: IncidentPreviewDto;
  onRefresh: () => void;
  onCompleted?: (type: string, id: string) => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const [editing, setEditing] = useState<{ type: string; id: string } | null>(
    null,
  );
  const mutation = useMutation();
  const [removeId, setRemoveId] = useState("");
  const labels: Record<string, string> = {
    CLASS_SESSION: l.classSession,
    PT_SESSION: l.ptSession,
    COURT_RENTAL: l.rental,
    ROOM_BLOCK: l.roomBlock,
  };
  return (
    <>
      <p>{preview.blockReason}</p>
      <Table
        headers={[l.impact, t.managerOperations.receiptId, l.start, l.end, ""]}
      >
        {preview.impacts.map((r) => (
          <tr key={`${r.sourceType}-${r.sourceId}`}>
            <td>{labels[r.sourceType] ?? r.sourceType}</td>
            <td>
              <code>{r.sourceId}</code>
            </td>
            <td>{formatDateTime(r.startAtUtc)}</td>
            <td>{formatDateTime(r.endAtUtc)}</td>
            <td>
              {r.sourceType === "CLASS_SESSION" ||
              r.sourceType === "PT_SESSION" ? (
                <button
                  className="btn btn--secondary"
                  onClick={() =>
                    setEditing({ type: r.sourceType, id: r.sourceId })
                  }
                >
                  {l.edit}
                </button>
              ) : r.sourceType === "ROOM_BLOCK" &&
                r.resolutionOptions.some(
                  (o) => o.action === "RemoveExistingBlock",
                ) ? (
                <button
                  className="btn btn--secondary"
                  disabled={mutation.busy}
                  onClick={() => setRemoveId(r.sourceId)}
                >
                  {l.remove}
                </button>
              ) : (
                <span>{l.refundHint}</span>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {removeId && (
        <Dialog
          title={l.remove}
          onClose={() => {
            if (!mutation.busy) setRemoveId("");
          }}
        >
          <p>
            {l.roomBlock} · <code>{removeId}</code>
          </p>
          <p>{t.managerOperations.partialHint}</p>
          <div className="btn-row">
            <button
              className="btn"
              disabled={mutation.busy}
              onClick={async () => {
                if (
                  await mutation.run(() =>
                    api.del(`/api/manager/room-blocks/${removeId}`),
                  )
                ) {
                  onCompleted?.("ROOM_BLOCK", removeId);
                  setRemoveId("");
                  onRefresh();
                }
              }}
            >
              {l.confirm}
            </button>
            <button
              className="btn btn--secondary"
              disabled={mutation.busy}
              onClick={() => setRemoveId("")}
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
          onSaved={() => {
            onCompleted?.("CLASS_SESSION", editing.id);
            setEditing(null);
            onRefresh();
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.type === "PT_SESSION" && (
        <PtImpactEditor
          key={editing.id}
          id={editing.id}
          onSaved={() => {
            onCompleted?.("PT_SESSION", editing.id);
            setEditing(null);
            onRefresh();
          }}
        />
      )}
      <MutationFeedback mutation={mutation} />
    </>
  );
}

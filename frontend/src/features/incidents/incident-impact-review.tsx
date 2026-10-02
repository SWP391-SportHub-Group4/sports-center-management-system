"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { Card, Table, Field, AsyncSection } from "@/components/ui";
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
}: {
  id: string;
  onSaved: () => void;
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
      return { session, sportId: course.sportId };
    },
    [id],
  );
  return (
    <AsyncSection state={state}>
      {(data) => (
        <SessionEditor
          session={data.session}
          sportId={data.sportId}
          onSaved={onSaved}
          onClose={onSaved}
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
  const mutation = useMutation();
  return (
    <Card title={l.ptSession}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
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
        <button className="btn" disabled={mutation.busy}>
          {l.confirm}
        </button>
      </form>
      <MutationFeedback mutation={mutation} />
    </Card>
  );
}
export function IncidentImpactReview({
  preview,
  onRefresh,
}: {
  preview: IncidentPreviewDto;
  onRefresh: () => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const [editing, setEditing] = useState<{ type: string; id: string } | null>(
    null,
  );
  const mutation = useMutation();
  const labels: Record<string, string> = {
    CLASS_SESSION: l.classSession,
    PT_SESSION: l.ptSession,
    COURT_RENTAL: l.rental,
    ROOM_BLOCK: l.roomBlock,
  };
  return (
    <>
      <p>{preview.blockReason}</p>
      <Table headers={[l.impact, l.start, l.end, ""]}>
        {preview.impacts.map((r) => (
          <tr key={`${r.sourceType}-${r.sourceId}`}>
            <td>{labels[r.sourceType] ?? r.sourceType}</td>
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
                  onClick={async () => {
                    if (
                      await mutation.run(() =>
                        api.del(`/api/manager/room-blocks/${r.sourceId}`),
                      )
                    )
                      onRefresh();
                  }}
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
      {editing?.type === "CLASS_SESSION" && (
        <ClassImpactEditor
          key={editing.id}
          id={editing.id}
          onSaved={() => {
            setEditing(null);
            onRefresh();
          }}
        />
      )}
      {editing?.type === "PT_SESSION" && (
        <PtImpactEditor
          key={editing.id}
          id={editing.id}
          onSaved={() => {
            setEditing(null);
            onRefresh();
          }}
        />
      )}
      <MutationFeedback mutation={mutation} />
    </>
  );
}

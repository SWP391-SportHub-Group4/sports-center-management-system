"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import styles from "./incidents.module.css";
import { api, ApiError } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { Table, AsyncSection, Dialog } from "@/components/ui";
import { CloseButton } from "@/components/CloseButton";
import { catalogApi } from "@/features/catalog";
import { useOperationsCopy } from "@/features/manager";
import { SessionEditor } from "@/features/courses";
import { MutationFeedback, useMutation } from "@/features/operations";
import { vietnamLocal } from "@/lib/vietnam-time";
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
          showCloseButton={false}
          embedded
          onOutcome={onOutcome}
        />
      )}
    </AsyncSection>
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
  const [editorBusy, setEditorBusy] = useState(false);
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
    COURT_RENTAL: l.rental,
    ROOM_BLOCK: l.roomBlock,
  };
  return (
    <>
      <div className={styles.impactSummary}>
        <p>
          {c.impactCount}: <strong>{preview.impacts.length}</strong>
        </p>
        <p>
          {preview.canResolve
            ? t.incidentHistory.ready
            : t.incidentHistory.changesNeeded}
        </p>
      </div>
      {preview.blockReason && (
        <p className={styles.notice}>{preview.blockReason}</p>
      )}
      {details.error && (
        <p role="status">
          {c.detailsUnavailable}{" "}
          <button className="btn btn--ghost" onClick={details.reload}>
            {l.refresh}
          </button>
        </p>
      )}
      {!preview.impacts.length && <p>{t.incidentHistory.noImpacts}</p>}
      {!!preview.impacts.length && (
        <Table headers={[l.impact, l.room, l.coach, l.start, l.end, ""]}>
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
                  {details.data?.rooms.find(
                    (room) => room.roomId === entry?.roomId,
                  )?.name || "—"}
                </td>
                <td>{entry?.coachName || "—"}</td>
                <td>{formatDateTime(r.startAtUtc)}</td>
                <td>{formatDateTime(r.endAtUtc)}</td>
                <td>
                  {r.sourceType === "CLASS_SESSION" ? (
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
      )}
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
            {details.data?.entries.find((entry) => entry.sourceId === removeId)
              ?.title || l.roomBlock}
          </p>
          <p>{t.incidentHistory.removeBlockHint}</p>
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
            <CloseButton
              label={l.close}
              variant="secondary"
              size="md"
              disabled={mutation.busy}
              onClick={() => {
                setRemoveId("");
                onEditingChange?.(false);
              }}
            />
          </div>
          <MutationFeedback mutation={mutation} />
        </Dialog>
      )}
      {editing?.type === "CLASS_SESSION" &&
        createPortal(
          <Dialog
            title={t.incidentHistory.editSession}
            size="lg"
            className={styles.dialog}
            onClose={() => {
              if (!editorBusy) closeEditor();
            }}
          >
            <ClassImpactEditor
              key={editing.id}
              id={editing.id}
              onOutcome={(status, message) => {
                setEditorBusy(status === "pending");
                onResult?.("CLASS_SESSION", editing.id, status, message);
              }}
              onSaved={() => {
                onCompleted?.("CLASS_SESSION", editing.id);
                closeEditor();
                onRefresh();
              }}
              onClose={closeEditor}
            />
          </Dialog>,
          document.body,
        )}
      <MutationFeedback mutation={mutation} />
    </>
  );
}

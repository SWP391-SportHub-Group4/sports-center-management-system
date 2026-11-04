"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import styles from "./incidents.module.css";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatPoints } from "@/lib/format";
import { Table, AsyncSection, Dialog } from "@/components/ui";
import { CloseButton } from "@/components/CloseButton";
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
import { IncidentSessionEditor } from "./incident-session-editor";
import {
  type IncidentRequest,
  type IncidentResolutionSelection,
} from "./incident-api";
function ClassImpactEditor({
  id,
  incident,
  onSaved,
  onClose,
  onOutcome,
  onStage,
  initialPlan,
}: {
  id: string;
  incident: IncidentRequest;
  onSaved: () => void;
  onClose: () => void;
  onOutcome: (status: StepStatus, message?: string) => void;
  onStage: (plan: IncidentResolutionSelection) => void;
  initialPlan?: IncidentResolutionSelection;
}) {
  const [openedAt] = useState(Date.now);
  async function confirmPlan(plan: IncidentResolutionSelection) {
    onStage(plan);
  }
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
      return {
        session,
        sportId: course.sportId,
        capacity: course.capacity,
        confirmedCount: course.confirmedCount,
      };
    },
    [id],
  );
  return (
    <AsyncSection state={state}>
      {(data) =>
        Date.parse(data.session.startAtUtc) <= openedAt ? (
          <IncidentSessionEditor
            session={data.session}
            confirmedCount={data.confirmedCount}
            sportId={data.sportId}
            incident={incident}
            onSaved={onSaved}
            onOutcome={onOutcome}
            onStage={onStage}
            onConfirm={confirmPlan}
            initialPlan={initialPlan}
          />
        ) : (
          <SessionEditor
            session={data.session}
            confirmedCount={data.confirmedCount}
            sportId={data.sportId}
            capacity={data.capacity}
            onSaved={onSaved}
            onClose={onClose}
            showCloseButton={false}
            showReviewActions={false}
            embedded
            showWeeklySchedule
            initialMode="cancel"
            onOutcome={onOutcome}
            onConfirmIncident={confirmPlan}
            initialIncidentPlan={initialPlan}
          />
        )
      }
    </AsyncSection>
  );
}
type AffectedMember = NonNullable<IncidentPreviewDto["members"]>[number];

/** A class with many affected sessions would otherwise list the same member once per session. */
function groupMembers(members: AffectedMember[]) {
  const rows = new Map<
    string,
    {
      memberId: string;
      memberName: string | null;
      outcome: string;
      count: number;
      points: number | null;
    }
  >();
  for (const m of members) {
    const key = `${m.memberId}|${m.outcome}`;
    const row = rows.get(key);
    if (row) {
      row.count += 1;
      if (m.expectedRefundPoints != null)
        row.points = (row.points ?? 0) + m.expectedRefundPoints;
    } else
      rows.set(key, {
        memberId: m.memberId,
        memberName: m.memberName,
        outcome: m.outcome,
        count: 1,
        points: m.expectedRefundPoints,
      });
  }
  return [...rows.values()];
}

export function IncidentImpactReview({
  preview,
  incidentRequest,
  onRefresh,
  onCompleted,
  onResult,
  onEditingChange,
  disabled = false,
  resolutions = [],
  onStage,
}: {
  preview: IncidentPreviewDto;
  incidentRequest: IncidentRequest;
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
  resolutions?: IncidentResolutionSelection[];
  onStage: (plan: IncidentResolutionSelection) => void;
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
      const entries = await api.get<CourtScheduleEntryDto[]>(
        "/api/manager/court-schedule",
        {
          signal,
          query: {
            fromDate: vietnamLocal(preview.startAtUtc).slice(0, 10),
            toDate: vietnamLocal(preview.endAtUtc).slice(0, 10),
          },
        },
      );
      return { entries };
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
        <h3>
          {c.impactCount}: {preview.impacts.length}
        </h3>
      </div>
      {details.error && <p role="status">{c.detailsUnavailable} </p>}
      {!preview.impacts.length && (
        <p className={styles.impactEmpty}>{t.incidentHistory.noImpacts}</p>
      )}
      {!!preview.impacts.length && (
        <Table headers={[l.impact, l.coach, l.start, l.end, t.common.actions]}>
          {preview.impacts.map((r) => {
            const entry = details.data?.entries.find(
              (e) => e.sourceType === r.sourceType && e.sourceId === r.sourceId,
            );
            return (
              <tr key={`${r.sourceType}-${r.sourceId}`}>
                <td>
                  <div className={styles.impactActivity}>
                    <span>{labels[r.sourceType] ?? r.sourceType}</span>
                    {entry && <span>{entry.title}</span>}
                  </div>
                </td>
                <td>{entry?.coachName || "—"}</td>
                <td>{formatDateTime(r.startAtUtc)}</td>
                <td>{formatDateTime(r.endAtUtc)}</td>
                <td>
                  {r.sourceType === "CLASS_SESSION" ? (
                    <button
                      className={`btn btn--secondary ${styles.makeupAction}`}
                      disabled={disabled || !!editing || !!removeId}
                      onClick={() => {
                        setEditing({ type: r.sourceType, id: r.sourceId });
                        onEditingChange?.(true);
                      }}
                    >
                      {t.incidentHistory.arrangeMakeup}
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
      {!!preview.members?.length && (
        <section aria-labelledby="incident-members">
          <h3 id="incident-members">{c.membersAffected}</h3>
          <Table
            headers={[
              c.member,
              c.outcome,
              { text: c.expectedPoints, numeric: true },
            ]}
          >
            {groupMembers(preview.members).map((m) => (
              <tr key={`${m.memberId}-${m.outcome}`}>
                <td>
                  {m.memberName ??
                    `${c.unnamedMember} ${m.memberId.slice(0, 8)}`}
                  {m.count > 1 && (
                    <p className="small muted">
                      {c.affectedSessions.replace("{n}", String(m.count))}
                    </p>
                  )}
                </td>
                <td>{c.outcomes[m.outcome] ?? m.outcome}</td>
                <td className="num">
                  {m.points == null ? "—" : formatPoints(m.points)}
                </td>
              </tr>
            ))}
          </Table>
          <p>
            {c.expectedTotal}:{" "}
            <strong>
              {formatPoints(preview.expectedRefundPointsTotal ?? 0)}
            </strong>
          </p>
          <p className="small muted">{c.quoteNote}</p>
        </section>
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
          <p>{t.incidentPlans.hint}</p>
          <div className="btn-row">
            <button
              className="btn"
              disabled={mutation.busy || disabled}
              onClick={() => {
                onStage({
                  sourceId: removeId,
                  action: "REMOVE_ROOM_BLOCK",
                  label:
                    details.data?.entries.find((e) => e.sourceId === removeId)
                      ?.title ?? l.roomBlock,
                });
                setRemoveId("");
                onEditingChange?.(false);
                onRefresh();
              }}
            >
              {t.incidentPlans.usePlan}
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
            className={`${styles.dialog} ${styles.sessionDialog}`}
            onClose={() => {
              if (!editorBusy) closeEditor();
            }}
          >
            <ClassImpactEditor
              key={editing.id}
              id={editing.id}
              incident={incidentRequest}
              initialPlan={resolutions.find(
                (plan) => plan.sourceId === editing.id,
              )}
              onStage={onStage}
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

"use client";
import Link from "next/link";
import { useState } from "react";
import styles from "./incidents.module.css";
import { Card, AsyncSection, Dialog, StatusChip } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatTime } from "@/lib/format";
import { vietnamLocal } from "@/lib/vietnam-time";
import { useOperationsCopy } from "@/features/manager";
import { MutationFeedback, useMutation } from "@/features/operations";
import {
  incidentApi,
  type IncidentAbandonResult,
  type IncidentFence,
  type IncidentFenceStep,
} from "./incident-api";

/**
 * Incidents the manager started handling and has not finished. They live on the server, so closing the tab or coming back
 * tomorrow loses nothing: this list shows what is left in each window and lets the manager continue, hold again or give it back.
 */
export function IncidentFences({ revision }: { revision: number }) {
  const { t } = useLanguage();
  const c = useOperationsCopy();
  const mutation = useMutation();
  const [local, setLocal] = useState(0);
  const [abandoning, setAbandoning] = useState<IncidentFence | null>(null);
  const state = useApi(
    (signal) => incidentApi.fences(signal),
    [revision, local],
  );
  const refresh = () => setLocal((n) => n + 1);

  if (state.data && state.data.length === 0) return null;
  return (
    <Card title={c.fencesTitle} hint={c.fencesHint}>
      <AsyncSection state={state}>
        {(fences) => (
          <div>
            {fences.map((fence) => (
              <FenceRow
                key={fence.fenceId}
                fence={fence}
                busy={mutation.busy}
                onExtend={async () => {
                  if (
                    await mutation.run(() =>
                      incidentApi.extendFence(fence.fenceId),
                    )
                  )
                    refresh();
                }}
                onRelease={async () => {
                  if (
                    await mutation.run(() =>
                      incidentApi.releaseFence(fence.fenceId),
                    )
                  )
                    refresh();
                }}
                onAbandon={() => setAbandoning(fence)}
                labels={{ center: c.fenceCenter, scopeRoom: t.operations.room }}
              />
            ))}
          </div>
        )}
      </AsyncSection>
      <MutationFeedback mutation={mutation} />
      {abandoning && (
        <AbandonDialog
          fence={abandoning}
          onClose={() => {
            setAbandoning(null);
            refresh();
          }}
        />
      )}
    </Card>
  );
}

function FenceRow({
  fence,
  busy,
  onExtend,
  onRelease,
  onAbandon,
  labels,
}: {
  fence: IncidentFence;
  busy: boolean;
  onExtend: () => void;
  onRelease: () => void;
  onAbandon: () => void;
  labels: { center: string; scopeRoom: string };
}) {
  const c = useOperationsCopy();
  const query = new URLSearchParams({
    scope: fence.scope,
    start: vietnamLocal(fence.startAtUtc),
    end: vietnamLocal(fence.endAtUtc),
    reason: fence.reason,
  });
  if (fence.roomId != null) query.set("roomId", String(fence.roomId));
  return (
    <section className={styles.fence} aria-label={fence.reason}>
      <h3>
        <StatusChip
          value={fence.isExpired ? "Expired" : "Active"}
          label={
            fence.isExpired
              ? c.fenceExpired
              : c.fenceHeldUntil.replace(
                  "{time}",
                  formatTime(fence.expiresAtUtc),
                )
          }
          tone={fence.isExpired ? "warning" : "success"}
        />{" "}
        {fence.scope === "CENTER"
          ? labels.center
          : (fence.roomName ?? labels.scopeRoom)}
        {" · "}
        {formatDateTime(fence.startAtUtc)} – {formatDateTime(fence.endAtUtc)}
      </h3>
      <p>{fence.reason}</p>
      <p className="small muted">
        {[
          fence.remainingImpacts > 0
            ? c.fenceLeft.replace("{n}", String(fence.remainingImpacts))
            : c.fenceClear,
          fence.affectedMemberCount > 0
            ? c.fenceMembers.replace("{n}", String(fence.affectedMemberCount))
            : null,
          fence.appliedSteps > 0
            ? c.fenceChanges.replace("{n}", String(fence.appliedSteps))
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="btn-row">
        <Link className="btn" href={`/manager/incidents?${query}`}>
          {c.fenceContinue}
        </Link>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={busy}
          onClick={onExtend}
        >
          {c.fenceExtend}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={onRelease}
        >
          {c.fenceRelease}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={onAbandon}
        >
          {c.fenceAbandon}
        </button>
      </div>
    </section>
  );
}

/**
 * Abandoning gives the window back AND reverts the schedule changes made while it was held. The dialog first shows exactly what
 * would be put back, then reports what it did and what it had to leave because the session had moved on.
 */
function AbandonDialog({
  fence,
  onClose,
}: {
  fence: IncidentFence;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const c = useOperationsCopy();
  const mutation = useMutation();
  const [result, setResult] = useState<IncidentAbandonResult | null>(null);
  const steps = useApi(
    (signal) => incidentApi.fenceSteps(fence.fenceId, signal),
    [fence.fenceId],
  );
  const pending = (steps.data ?? []).filter((s) => s.state === "APPLIED");
  return (
    <Dialog
      title={c.abandonTitle}
      description={result ? undefined : c.abandonLead}
      onClose={() => !mutation.busy && onClose()}
      footer={
        result ? (
          <button type="button" className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={mutation.busy}
              onClick={onClose}
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              className="btn"
              disabled={mutation.busy || steps.loading}
              onClick={async () => {
                await mutation.run(async () => {
                  setResult(await incidentApi.abandonFence(fence.fenceId));
                }, "");
              }}
            >
              {mutation.busy ? t.common.loading : c.abandonConfirm}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="stack" role="status">
          <p>
            <strong>
              {c.abandonDone.replace("{n}", String(result.undone))}
            </strong>
          </p>
          {result.notUndone.length > 0 && (
            <>
              <p>{c.abandonLeft}</p>
              <StepList steps={result.notUndone} showNote />
            </>
          )}
        </div>
      ) : (
        <AsyncSection state={steps}>
          {() =>
            pending.length === 0 ? (
              <p>{c.abandonNone}</p>
            ) : (
              <div className="stack">
                <StepList steps={pending} />
                <p className="small muted">{c.abandonKeep}</p>
              </div>
            )
          }
        </AsyncSection>
      )}
      <MutationFeedback mutation={mutation} />
    </Dialog>
  );
}

function StepList({
  steps,
  showNote = false,
}: {
  steps: IncidentFenceStep[];
  showNote?: boolean;
}) {
  const c = useOperationsCopy();
  return (
    <ul>
      {steps.map((step) => (
        <li key={step.stepId}>
          <strong>
            {step.kind === "REMOVE_ROOM_BLOCK"
              ? step.className
              : `${step.className} · #${step.sessionNo}`}
          </strong>{" "}
          {c.abandonKinds[step.kind] ?? step.kind}:{" "}
          {step.kind === "REVIEWED_COMPLETED"
            ? c.abandonReviewed
            : step.kind === "REMOVE_ROOM_BLOCK"
              ? formatDateTime(step.beforeStartUtc)
              : c.abandonMoved
                  .replace("{from}", formatDateTime(step.beforeStartUtc))
                  .replace("{to}", formatDateTime(step.afterStartUtc))}
          {step.kind !== "REVIEWED_COMPLETED" &&
            !step.canUndo &&
            step.state === "APPLIED" && (
              <p className="small muted">{c.abandonPast}</p>
            )}
          {showNote && step.undoNote && (
            <p className="small muted">{step.undoNote}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

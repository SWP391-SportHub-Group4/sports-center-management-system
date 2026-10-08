"use client";
import { useState } from "react";
import { AsyncSection, Card, Field, StatusChip } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { PtReviewRequestDto } from "@/lib/types";
import { ptApi } from "./api";
import { ListPager } from "./ui";
import styles from "./pt-change-request-panel.module.css";
function RequestCard({
  r,
  coach,
  reload,
  onMoved,
}: {
  r: PtReviewRequestDto;
  coach: boolean;
  reload: () => void;
  onMoved: (v: {
    movedSessionIds: string[];
    unmovedSessionIds: string[];
  }) => void;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const [reason, setReason] = useState("");
  const mutation = useMutation();
  async function review(approve: boolean) {
    if (
      await mutation.run(async () => {
        const result = await api.post<{
          movedSessionIds: string[];
          unmovedSessionIds: string[];
        }>(
          `/api/manager/pt-${coach ? "coach" : "session"}-change-requests/${r.requestId}/${approve ? "approve" : "reject"}`,
          { reviewNote: reason.trim() },
        );
        if (coach && approve) onMoved(result);
      })
    )
      reload();
  }
  return (
    <Card
      title={r.memberName?.trim() || t.operationsUx.unnamedMember}
      actions={<StatusChip value={r.status} />}
    >
      <div className={styles.content}>
        <div className={styles.badges}>
          {coach ? (
            <span>{l.coachChanges}</span>
          ) : (
            <>
              <StatusChip value={r.requestType} />
              <StatusChip value={r.timingClassification} />
            </>
          )}
          {r.requestsException && (
            <StatusChip value="EXCEPTION" label={l.exception} tone="warning" />
          )}
          {!coach && r.coachName && (
            <span className={styles.muted}>
              {l.coach}: {r.coachName}
            </span>
          )}
        </div>
        <dl className={styles.times}>
          {coach ? (
            <>
              <div>
                <dt>{t.operationsUx.currentCoach}</dt>
                <dd>{r.currentCoachName || "—"}</dd>
              </div>
              <div>
                <dt>{t.operationsUx.proposedCoach}</dt>
                <dd>{r.requestedCoachName || "—"}</dd>
              </div>
            </>
          ) : (
            <>
              {r.sessionStartAtUtc && (
                <div>
                  <dt>{t.operationsUx.currentTime}</dt>
                  <dd>{formatDateTime(r.sessionStartAtUtc)}</dd>
                </div>
              )}
              {r.requestedStartAtUtc && (
                <div>
                  <dt>{l.requestedTime}</dt>
                  <dd>{formatDateTime(r.requestedStartAtUtc)}</dd>
                </div>
              )}
            </>
          )}
        </dl>
        {r.reason && (
          <div className={styles.reason}>
            <strong>{l.reason}</strong>
            <p>{r.reason}</p>
          </div>
        )}
        <details className={styles.policy}>
          <summary>{t.operationsUx.policy}</summary>
          <p>{coach ? l.coachImpact : l.quotaImpact}</p>
        </details>
        {r.reviewNote && (
          <div className={styles.reason}>
            <strong>{l.reviewNote}</strong>
            <p>{r.reviewNote}</p>
          </div>
        )}
        {r.status === "PENDING" && (
          <div className={styles.review}>
            <Field label={l.reviewNote} hint={t.operationsUx.reviewHint}>
              <textarea
                required
                minLength={3}
                maxLength={500}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <div className="btn-row">
              <button
                className="btn"
                disabled={mutation.busy || reason.trim().length < 3}
                onClick={() => review(true)}
              >
                {l.approve}
              </button>
              <button
                className="btn btn--danger"
                disabled={mutation.busy || reason.trim().length < 3}
                onClick={() => review(false)}
              >
                {l.reject}
              </button>
            </div>
          </div>
        )}
        <MutationFeedback mutation={mutation} />
      </div>
    </Card>
  );
}
function Requests({ coach }: { coach: boolean }) {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [moved, setMoved] = useState<{
    movedSessionIds: string[];
    unmovedSessionIds: string[];
  } | null>(null);
  const state = useApi(
    (signal) => ptApi.requests(coach, page, signal),
    [coach, page],
  );
  return (
    <>
      {moved && (
        <Card>
          <p>
            {t.staffWork.moved}: {moved.movedSessionIds.length}
          </p>
          <p>
            {t.staffWork.unmoved}: {moved.unmovedSessionIds.length}
          </p>
        </Card>
      )}
      <div className={styles.toolbar}>
        <button className="btn btn--ghost btn--sm" onClick={state.reload}>
          {t.staffWork.refresh}
        </button>
      </div>
      <AsyncSection state={state}>
        {(rows) => (
          <div className={styles.list}>
            {rows.map((r) => (
              <RequestCard
                key={`${r.requestId}-${r.status}`}
                r={r}
                coach={coach}
                reload={state.reload}
                onMoved={setMoved}
              />
            ))}
            {!rows.length && <p>{t.common.noData}</p>}
            <ListPager page={page} count={rows.length} onChange={setPage} />
          </div>
        )}
      </AsyncSection>
    </>
  );
}
export function PtChangeRequestPanel() {
  const { t } = useLanguage();
  const [coach, setCoach] = useState(false);
  return (
    <>
      <div className="btn-row">
        <button
          className="btn btn--secondary"
          aria-pressed={!coach}
          onClick={() => setCoach(false)}
        >
          {t.staffWork.sessionChanges}
        </button>
        <button
          className="btn btn--secondary"
          aria-pressed={coach}
          onClick={() => setCoach(true)}
        >
          {t.staffWork.coachChanges}
        </button>
      </div>
      <Requests key={String(coach)} coach={coach} />
    </>
  );
}

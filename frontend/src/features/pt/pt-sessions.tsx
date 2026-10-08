"use client";
import { useState } from "react";
import Link from "next/link";
import { AsyncSection, Card, Field, StatusChip } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { PtEntitlementDto, PtSessionDto } from "@/lib/types";
import { ptApi } from "./api";
import { ListPager, Specialty } from "./ui";
import { PtQuotaSummary } from "./pt-quota-summary";
import { PtSessionEditor } from "./pt-session-editor";
import styles from "./pt-sessions.module.css";

function SessionActions({
  session: s,
  manager,
  hasPt,
  reload,
}: {
  session: PtSessionDto;
  manager: boolean;
  hasPt: boolean;
  reload: () => void;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const mutation = useMutation();
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  async function perform(action: string) {
    const ok = await mutation.run(() =>
      api.post(
        `/api/${manager ? "manager" : "coaches/me"}/pt-sessions/${s.sessionId}/${action}`,
        action === "complete" ? undefined : { reason: reason.trim() },
      ),
    );
    if (ok || mutation.error?.status === 409) reload();
  }
  return (
    <article
      className={styles.session}
      aria-label={`${s.memberName} · ${s.coachName}`}
    >
      <div className={styles.sessionSummary}>
        <div className={styles.sessionInfo}>
          <h3>
            {s.memberName} · {s.coachName}
          </h3>
          <p className={styles.sessionTime}>
            {formatDateTime(s.startAtUtc)} – {formatDateTime(s.endAtUtc)} ·{" "}
            {s.roomName ?? l.noRoom}
          </p>
        </div>
        <div className={styles.badges}>
          <StatusChip value={s.status} />
          <StatusChip value={s.quotaState} />
        </div>
      </div>
      {s.cancellationReason && <p>{s.cancellationReason}</p>}
      {s.rescheduledFromSessionId && (
        <p>
          {l.previousSession}: {s.rescheduledFromSessionId}
        </p>
      )}
      {s.status === "SCHEDULED" && (manager || hasPt) && (
        <>
          <Field label={l.reason}>
            <textarea
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="btn-row">
            {manager ? (
              <>
                <button
                  className="btn btn--secondary"
                  disabled={mutation.busy}
                  onClick={() => setEditing(!editing)}
                >
                  {l.reschedule}
                </button>
                <button
                  className="btn btn--danger"
                  disabled={mutation.busy || reason.trim().length < 3}
                  onClick={() => perform("cancel")}
                >
                  {l.cancelSession}
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn"
                  disabled={mutation.busy}
                  onClick={() => perform("complete")}
                >
                  {l.complete}
                </button>
                <button
                  className="btn btn--secondary"
                  disabled={mutation.busy}
                  onClick={() => perform("no-show")}
                >
                  {l.noShow}
                </button>
              </>
            )}
          </div>
        </>
      )}
      {!manager && hasPt && s.status === "COMPLETED" && (
        <Link
          className="btn btn--secondary"
          href={`/coach/progress?sessionId=${s.sessionId}`}
        >
          {l.results}
        </Link>
      )}
      <MutationFeedback mutation={mutation} />
      {editing && <PtSessionEditor session={s} onSaved={reload} />}
    </article>
  );
}
function SessionList({ manager, hasPt }: { manager: boolean; hasPt: boolean }) {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [entitlement, setEntitlement] = useState<PtEntitlementDto | null>(null);
  const state = useApi(
    (signal) => ptApi.sessions(manager, page, signal),
    [manager, page, revision],
  );
  const reload = () => {
    setRevision((r) => r + 1);
    setEntitlement(null);
  };
  return (
    <>
      {!manager && !hasPt && (
        <p role="status">{t.staffWork.specialtyWarning}</p>
      )}
      <PtQuotaSummary
        key={revision}
        manager={manager}
        onSelect={manager ? setEntitlement : undefined}
      />
      {entitlement && (
        <PtSessionEditor
          key={entitlement.entitlementId}
          entitlement={entitlement}
          onSaved={reload}
        />
      )}
      <Card
        title={t.staffWork.sessions}
        actions={
          <button className="btn btn--secondary" onClick={state.reload}>
            {t.common.retry}
          </button>
        }
      >
        <AsyncSection state={state}>
          {(rows) => (
            <div className={styles.sessionPage}>
              <div className={styles.sessionList}>
                {rows.map((s) => (
                  <SessionActions
                    key={`${s.sessionId}-${s.status}`}
                    session={s}
                    manager={manager}
                    hasPt={hasPt}
                    reload={reload}
                  />
                ))}
              </div>
              {!rows.length && <p>{t.common.noData}</p>}
              <ListPager page={page} count={rows.length} onChange={setPage} />
            </div>
          )}
        </AsyncSection>
      </Card>
    </>
  );
}
export function PtSessions({ manager = false }: { manager?: boolean }) {
  return manager ? (
    <SessionList manager hasPt />
  ) : (
    <Specialty>
      {(hasPt) => <SessionList manager={false} hasPt={hasPt} />}
    </Specialty>
  );
}

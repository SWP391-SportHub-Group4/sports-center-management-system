"use client";
import { useState } from "react";
import Link from "next/link";
import { AsyncSection, Card, Field, Dialog, StatusChip } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { formatDate, formatTime } from "@/lib/format";
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
    return ok;
  }
  const [cancelling, setCancelling] = useState(false);
  return (
    <article
      className={styles.session}
      aria-label={s.memberName + " · " + s.coachName}
    >
      <div className={styles.row}>
        <strong>{s.memberName}</strong>
        <div className={styles.schedule}>
          <time dateTime={s.startAtUtc}>{formatDate(s.startAtUtc)}</time>
          <span>
            {formatTime(s.startAtUtc)}–{formatTime(s.endAtUtc)}
          </span>
        </div>
        <div className={styles.location}>
          <span>{s.coachName}</span>
          <span className="small muted">{s.roomName ?? l.noRoom}</span>
        </div>
        <div className={styles.status}>
          <StatusChip value={s.status} />
          {!manager && <StatusChip value={s.quotaState} />}
        </div>
        <div className={styles.actions}>
          {s.status === "SCHEDULED" &&
            (manager || hasPt) &&
            (manager ? (
              <>
                <button
                  className="btn btn--secondary"
                  disabled={mutation.busy}
                  onClick={() => setEditing(true)}
                >
                  {l.reschedule}
                </button>
                <button
                  className="btn btn--danger"
                  disabled={mutation.busy}
                  onClick={() => {
                    setReason("");
                    mutation.reset();
                    setCancelling(true);
                  }}
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
            ))}
          {!manager && hasPt && s.status === "COMPLETED" && (
            <Link
              className="btn btn--secondary"
              href={"/coach/progress?sessionId=" + s.sessionId}
            >
              {l.results}
            </Link>
          )}
        </div>
      </div>
      {!manager && s.cancellationReason && (
        <p className="small muted">{s.cancellationReason}</p>
      )}
      {!manager && s.status === "SCHEDULED" && hasPt && (
        <Field label={l.reason}>
          <textarea
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      )}
      {!cancelling && <MutationFeedback mutation={mutation} />}
      {editing && (
        <Dialog
          title={l.reschedule}
          onClose={() => setEditing(false)}
          size="lg"
        >
          <PtSessionEditor
            session={s}
            onSaved={() => {
              setEditing(false);
              reload();
            }}
          />
        </Dialog>
      )}
      {cancelling && (
        <Dialog
          title={l.cancelSession}
          onClose={() => setCancelling(false)}
          footer={
            <button
              className="btn btn--danger"
              disabled={mutation.busy || reason.trim().length < 3}
              onClick={async () => {
                if (await perform("cancel")) setCancelling(false);
              }}
            >
              {l.cancelSession}
            </button>
          }
        >
          <p>
            <strong>{s.memberName}</strong> · {formatDate(s.startAtUtc)} ·{" "}
            {formatTime(s.startAtUtc)}–{formatTime(s.endAtUtc)}
          </p>
          <Field label={l.reason}>
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <MutationFeedback mutation={mutation} />
        </Dialog>
      )}
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
            <>
              <div className={styles.list}>
                {manager && (
                  <div className={styles.head} aria-hidden="true">
                    <span>{t.frontDesk.colName}</span>
                    <span>{t.staffWork.start}</span>
                    <span>
                      {t.staffWork.coach} / {t.staffWork.room}
                    </span>
                    <span>{t.operations.status}</span>
                    <span>{t.common.actions}</span>
                  </div>
                )}
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
            </>
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

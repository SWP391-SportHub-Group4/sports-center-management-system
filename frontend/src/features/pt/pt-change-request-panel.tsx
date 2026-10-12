"use client";
import { useState } from "react";
import {
  AsyncSection,
  Card,
  Dialog,
  Field,
  StatusChip,
  Table,
} from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { formatDateTime } from "@/lib/format";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { PtReviewRequestDto } from "@/lib/types";
import { ptApi } from "./api";
import { ListPager } from "./ui";
import { MemberName } from "@/components/RecordName";
import styles from "./pt-change-requests.module.css";

function RequestReview({
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
    <div className="stack">
      <strong>
        <MemberName id={r.memberId} name={r.memberName} />
      </strong>
      <p>
        <StatusChip value={r.status} /> ·{" "}
        {coach ? (
          `${r.currentCoachName} → ${r.requestedCoachName}`
        ) : (
          <>
            <StatusChip value={r.requestType} /> ·{" "}
            <StatusChip value={r.timingClassification} />
          </>
        )}
      </p>
      <p>{r.reason}</p>
      {r.sessionStartAtUtc && (
        <p>
          {formatDateTime(r.sessionStartAtUtc)}
          {r.requestedStartAtUtc && (
            <> → {formatDateTime(r.requestedStartAtUtc)}</>
          )}
        </p>
      )}
      {r.requestsException && <p>{l.exception}</p>}
      {r.status === "PENDING" && (
        <p className="small muted">{coach ? l.coachImpact : l.quotaImpact}</p>
      )}
      {r.reviewNote && (
        <p>
          {l.reviewNote}: {r.reviewNote}
        </p>
      )}
      {r.status === "PENDING" && (
        <>
          <Field label={l.reviewNote}>
            <textarea
              required
              minLength={3}
              maxLength={500}
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
        </>
      )}
      <MutationFeedback mutation={mutation} />
    </div>
  );
}
function Requests({ coach }: { coach: boolean }) {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PtReviewRequestDto | null>(null);
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
      <Card
        title={t.staffWork.requests}
        actions={
          <button className="btn btn--secondary" onClick={state.reload}>
            {t.staffWork.refresh}
          </button>
        }
      >
        <AsyncSection state={state}>
          {(rows) => (
            <>
              {rows.length ? (
                <div className={styles.table}>
                  <Table
                    headers={[
                      t.staffWork.member,
                      coach
                        ? t.staffWork.coachChanges
                        : t.staffWork.sessionChanges,
                      t.staffWork.reason,
                      t.staffWork.status,
                      t.staffWork.actions,
                    ]}
                  >
                    {rows.map((r) => (
                      <tr key={r.requestId}>
                        <td>
                          <strong>
                            <MemberName id={r.memberId} name={r.memberName} />
                          </strong>
                        </td>
                        <td>
                          {coach ? (
                            <>
                              <span className={styles.line}>
                                {r.currentCoachName}
                              </span>
                              <span className={styles.line}>
                                → {r.requestedCoachName}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className={styles.line}>
                                <StatusChip value={r.requestType} />
                              </span>
                              {r.sessionStartAtUtc && (
                                <span className={styles.line}>
                                  {formatDateTime(r.sessionStartAtUtc)}
                                </span>
                              )}
                              {r.requestedStartAtUtc && (
                                <span className={styles.line}>
                                  → {formatDateTime(r.requestedStartAtUtc)}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td>{r.reason}</td>
                        <td>
                          <StatusChip value={r.status} />
                        </td>
                        <td>
                          <button
                            className="btn btn--secondary"
                            onClick={() => setSelected(r)}
                          >
                            {r.status === "PENDING"
                              ? t.operations.review
                              : t.operations.details}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>
              ) : (
                <p>{t.common.noData}</p>
              )}
              <ListPager
                align="left"
                page={page}
                count={rows.length}
                onChange={setPage}
              />
            </>
          )}
        </AsyncSection>
      </Card>
      {selected && (
        <Dialog
          title={
            selected.status === "PENDING"
              ? t.operations.review
              : t.operations.details
          }
          onClose={() => setSelected(null)}
        >
          <RequestReview
            key={`${selected.requestId}-${selected.status}`}
            r={selected}
            coach={coach}
            reload={() => {
              setSelected(null);
              state.reload();
            }}
            onMoved={setMoved}
          />
        </Dialog>
      )}
    </>
  );
}
export function PtChangeRequestPanel() {
  const { t } = useLanguage();
  const { values, setValues } = useUrlQuery(
    { type: "session" },
    { type: choiceQuery(["session", "coach"], "session") },
  );
  const coach = values.type === "coach";
  return (
    <>
      <div className="btn-row">
        <button
          className="btn btn--secondary"
          aria-pressed={!coach}
          onClick={() => setValues({ type: "session" })}
        >
          {t.staffWork.sessionChanges}
        </button>
        <button
          className="btn btn--secondary"
          aria-pressed={coach}
          onClick={() => setValues({ type: "coach" })}
        >
          {t.staffWork.coachChanges}
        </button>
      </div>
      <Requests key={String(coach)} coach={coach} />
    </>
  );
}

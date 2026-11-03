"use client";

import { useState } from "react";
import { AsyncSection, Card, Pager, Table } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatPoints } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import { pagedItems } from "@/lib/paged";
import type { Paged } from "@/lib/types";

type CreditRequest = {
  requestId: string;
  ownerUserId: string;
  requestedByUserId: string;
  points: number;
  reason: string;
  requestedAtUtc: string;
  ownerName?: string;
  ownerEmail?: string;
  requestedByName?: string;
};

export function PointCreditApprovals({
  revision,
  onChanged,
}: {
  revision: number;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const l = t.staffWork;
  const [page, setPage] = useState(1);
  const requests = useApi(
    (signal) =>
      api.get<Paged<CreditRequest>>("/api/point-credit-requests", {
        signal,
        query: { status: "Pending", page, pageSize: 20 },
      }),
    [revision, page],
  );
  const mutation = useMutation();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function approve(id: string) {
    if (
      await mutation.run(() =>
        api.post(`/api/point-credit-requests/${id}/approve`),
      )
    ) {
      requests.reload();
      onChanged();
    }
  }
  async function reject(id: string) {
    if (
      await mutation.run(() =>
        api.post(`/api/point-credit-requests/${id}/reject`, {
          reason: reason.trim(),
        }),
      )
    ) {
      setRejectingId(null);
      setReason("");
      requests.reload();
      onChanged();
    }
  }

  return (
    <Card title={l.pendingCredits}>
      <AsyncSection state={requests}>
        {(data) =>
          data.totalCount === 0 ? (
            <p>{l.noPendingCredits}</p>
          ) : (
            <>
              <Table
                headers={[
                  l.owner,
                  l.points,
                  l.reason,
                  l.requestedBy,
                  l.actions,
                ]}
              >
                {pagedItems(data).map((item) => (
                  <tr key={item.requestId}>
                    <td>
                      {item.ownerName ?? item.ownerUserId}
                      <br />
                      <small>{item.ownerEmail}</small>
                    </td>
                    <td>{formatPoints(item.points)}</td>
                    <td>
                      {item.reason}
                      <br />
                      <small>{formatDateTime(item.requestedAtUtc)}</small>
                    </td>
                    <td>{item.requestedByName ?? item.requestedByUserId}</td>
                    <td>
                      {item.requestedByUserId === user?.userId ? (
                        <span>{l.ownCreditRequest}</span>
                      ) : (
                        <div className="form">
                          <button
                            className="btn"
                            disabled={mutation.busy}
                            onClick={() => approve(item.requestId)}
                          >
                            {l.approveCredit}
                          </button>
                          {rejectingId === item.requestId ? (
                            <>
                              <input
                                aria-label={l.rejectionReason}
                                value={reason}
                                maxLength={500}
                                onChange={(event) =>
                                  setReason(event.target.value)
                                }
                              />
                              <button
                                className="btn btn--secondary"
                                disabled={
                                  mutation.busy || reason.trim().length < 3
                                }
                                onClick={() => reject(item.requestId)}
                              >
                                {l.rejectCredit}
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn btn--secondary"
                              disabled={mutation.busy}
                              onClick={() => {
                                setRejectingId(item.requestId);
                                setReason("");
                              }}
                            >
                              {l.rejectCredit}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
              <Pager
                page={data.page}
                pageSize={data.pageSize}
                totalCount={data.totalCount}
                onChange={setPage}
              />
            </>
          )
        }
      </AsyncSection>
      <MutationFeedback mutation={mutation} />
    </Card>
  );
}

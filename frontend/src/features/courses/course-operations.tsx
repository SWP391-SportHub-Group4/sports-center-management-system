"use client";
import { pagedItems } from "@/lib/paged";
import { useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { AsyncSection, Card, Table, StatusChip, Field } from "@/components/ui";
import {
  Pagination,
  MutationFeedback,
  useMutation,
} from "@/features/operations";
import { InvoiceDetail } from "@/features/payments";
import type { Paged, InvoiceDetailDto } from "@/lib/types";
type Row = {
  holdId?: string;
  enrollmentId?: string;
  responseId?: string;
  memberName: string;
  status?: string;
  resolutionStatus?: string;
  choice?: string;
  targetClassId?: number;
  invoiceId?: string;
  invoiceItemId?: string;
  additionalInvoiceId?: string;
  expiresAtUtc?: string;
  enrolledAt?: string;
  deadlineUtc?: string;
};
export function CourseOperations({ classId }: { classId: number }) {
  return (
    <>
      {(["holds", "enrollments", "threshold-responses"] as const).map(
        (kind) => (
          <OperationsRows key={kind} classId={classId} kind={kind} />
        ),
      )}
    </>
  );
}
function OperationsRows({
  classId,
  kind,
}: {
  classId: number;
  kind: "holds" | "enrollments" | "threshold-responses";
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const [page, setPage] = useState(1);
  const [invoiceId, setInvoiceId] = useState("");
  const mutation = useMutation();
  const state = useApi(
    (signal) =>
      api.get<Paged<Row>>(`/api/manager/classes/${classId}/${kind}`, {
        signal,
        query: { page, pageSize: 20 },
      }),
    [classId, kind, page],
  );
  return (
    <Card
      title={
        kind === "holds"
          ? l.held
          : kind === "enrollments"
            ? l.enrollments
            : l.thresholdResponses
      }
    >
      <button className="btn btn--ghost" onClick={state.reload}>
        {l.refresh}
      </button>
      <AsyncSection state={state}>
        {(data) => (
          <>
            <Table
              headers={[l.member, l.status, l.deadline, l.choice, l.invoices]}
            >
              {pagedItems(data).map((row) => (
                <tr key={row.holdId ?? row.enrollmentId ?? row.responseId}>
                  <td>{row.memberName}</td>
                  <td>
                    <StatusChip
                      value={row.status ?? row.resolutionStatus ?? ""}
                    />
                  </td>
                  <td>
                    {row.expiresAtUtc || row.deadlineUtc || row.enrolledAt
                      ? formatDateTime(
                          (row.expiresAtUtc ??
                            row.deadlineUtc ??
                            row.enrolledAt)!,
                        )
                      : "—"}
                  </td>
                  <td>
                    {row.choice ? <StatusChip value={row.choice} /> : "—"}
                    {row.targetClassId && ` · #${row.targetClassId}`}
                  </td>
                  <td>
                    {(row.invoiceId ||
                      row.additionalInvoiceId ||
                      row.invoiceItemId) && (
                      <button
                        className="btn btn--secondary"
                        disabled={mutation.busy}
                        onClick={async () => {
                          const id = row.invoiceId ?? row.additionalInvoiceId;
                          if (id) setInvoiceId(id);
                          else
                            await mutation.run(async () => {
                              const result = await api.get<InvoiceDetailDto>(
                                `/api/invoices/by-item/${row.invoiceItemId}`,
                              );
                              setInvoiceId(result.summary.invoiceId);
                            }, "");
                        }}
                      >
                        {l.details}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination
              page={page}
              count={data.totalCount}
              onChange={setPage}
            />
          </>
        )}
      </AsyncSection>
      <MutationFeedback mutation={mutation} />
      {invoiceId && (
        <InvoiceDetail key={invoiceId} invoiceId={invoiceId} staff />
      )}
    </Card>
  );
}
interface CancellationPreview {
  canCancel: boolean;
  previewToken: string;
  totalSessions: number;
  sessionsNotProvided: number;
  confirmedCount: number;
  activeHoldCount: number;
  refundPoints: number;
}
export function CourseCancellation({
  classId,
  onSaved,
}: {
  classId: number;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<CancellationPreview | null>(null);
  const revision = useRef(0);
  const mutation = useMutation();
  return (
    <Card title={l.cancel}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const expected = revision.current;
          await mutation.run(async () => {
            const result = await api.get<CancellationPreview>(
              `/api/manager/classes/${classId}/cancellation-preview`,
            );
            if (revision.current === expected) setReview(result);
          }, "");
        }}
      >
        <Field label={l.reason}>
          <textarea
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(e) => {
              revision.current++;
              setReason(e.target.value);
              setReview(null);
            }}
          />
        </Field>
        <button className="btn btn--secondary" disabled={mutation.busy}>
          {l.cancellationPreview}
        </button>
      </form>
      {review && (
        <>
          <p>
            {l.confirmed}: {review.confirmedCount} · {l.held}:{" "}
            {review.activeHoldCount}
          </p>
          <p>
            {l.sessionsRemaining}: {review.sessionsNotProvided}/
            {review.totalSessions}
          </p>
          <p>
            {l.refundTotal}: {review.refundPoints}
          </p>
          {!review.canCancel && <p role="alert">{l.courseCancelBlocked}</p>}
          <button
            className="btn"
            disabled={mutation.busy || !review.canCancel}
            onClick={async () => {
              const ok = await mutation.run(() =>
                api.post(`/api/manager/classes/${classId}/cancel`, {
                  reason,
                  previewToken: review.previewToken,
                }),
              );
              setReview(null);
              if (ok) onSaved();
            }}
          >
            {l.confirm}
          </button>
        </>
      )}
      <MutationFeedback mutation={mutation} />
    </Card>
  );
}

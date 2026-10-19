"use client";
import styles from "./course-students.module.css";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
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
import { CourseName } from "@/components/RecordName";
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
export function CourseOperations({
  classId,
  kind,
  toolbar,
}: {
  classId: number;
  toolbar?: ReactNode;
  kind?: "holds" | "enrollments" | "threshold-responses";
}) {
  return (
    <>
      {(kind
        ? [kind]
        : (["holds", "enrollments", "threshold-responses"] as const)
      ).map((kind) => (
        <OperationsRows
          key={kind}
          classId={classId}
          kind={kind}
          toolbar={toolbar}
        />
      ))}
    </>
  );
}
function OperationsRows({
  classId,
  kind,
  toolbar,
}: {
  classId: number;
  kind: "holds" | "enrollments" | "threshold-responses";
  toolbar?: ReactNode;
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
    <div className={toolbar ? styles.workspace : undefined}>
      <Card
        title={
          toolbar ??
          (kind === "holds"
            ? l.held
            : kind === "enrollments"
              ? l.enrollments
              : l.thresholdResponses)
        }
        actions={
          <button
            className="btn btn--ghost"
            onClick={state.reload}
            disabled={state.loading}
          >
            {l.refresh}
          </button>
        }
      >
        {kind === "holds" && toolbar && (
          <p className={styles.holdHint}>{t.managerOperations.holdHint}</p>
        )}
        <AsyncSection state={state}>
          {(data) => (
            <>
              {pagedItems(data).length === 0 ? (
                <p className={styles.empty} role="status">
                  {kind === "holds"
                    ? t.classWorkspace.noActiveHolds
                    : kind === "enrollments"
                      ? t.classWorkspace.noStudents
                      : l.empty}
                </p>
              ) : (
                <div
                  className={
                    kind === "threshold-responses"
                      ? undefined
                      : styles.studentTable
                  }
                >
                  <Table
                    headers={[
                      kind === "threshold-responses"
                        ? l.member
                        : t.classWorkspace.student,
                      l.status,
                      kind === "enrollments"
                        ? t.classWorkspace.enrolledOn
                        : kind === "holds"
                          ? t.classWorkspace.expiresAt
                          : l.deadline,
                      ...(kind === "threshold-responses" ? [l.choice] : []),
                      l.invoices,
                    ]}
                  >
                    {pagedItems(data).map((row) => (
                      <tr
                        key={row.holdId ?? row.enrollmentId ?? row.responseId}
                      >
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
                        {kind === "threshold-responses" && (
                          <td>
                            {row.choice ? (
                              <StatusChip value={row.choice} />
                            ) : (
                              "—"
                            )}
                            {row.targetClassId && (
                              <>
                                {" "}
                                · <CourseName id={row.targetClassId} />
                              </>
                            )}
                          </td>
                        )}
                        <td>
                          {row.invoiceId ||
                          row.additionalInvoiceId ||
                          row.invoiceItemId ? (
                            <button
                              className="btn btn--secondary"
                              disabled={mutation.busy}
                              onClick={async () => {
                                const id =
                                  row.invoiceId ?? row.additionalInvoiceId;
                                if (id) setInvoiceId(id);
                                else
                                  await mutation.run(async () => {
                                    const result =
                                      await api.get<InvoiceDetailDto>(
                                        `/api/invoices/by-item/${row.invoiceItemId}`,
                                      );
                                    setInvoiceId(result.summary.invoiceId);
                                  }, "");
                              }}
                            >
                              {t.checkout.viewInvoice}
                            </button>
                          ) : (
                            <span className="muted">&mdash;</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
              {data.totalCount > 20 && (
                <Pagination
                  page={page}
                  count={data.totalCount}
                  onChange={setPage}
                />
              )}
            </>
          )}
        </AsyncSection>
        <MutationFeedback mutation={mutation} />
        {invoiceId &&
          createPortal(
            <InvoiceDetail
              key={invoiceId}
              invoiceId={invoiceId}
              staff
              onClose={() => setInvoiceId("")}
            />,
            document.body,
          )}
      </Card>
    </div>
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
  initialReason = "",
  embedded = false,
}: {
  classId: number;
  onSaved: () => void;
  /** Pre-fills the reason, e.g. the incident the manager just described while closing enrollment. */
  initialReason?: string;
  embedded?: boolean;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const [reason, setReason] = useState(initialReason);
  const [review, setReview] = useState<CancellationPreview | null>(null);
  const revision = useRef(0);
  const mutation = useMutation();
  return (
    <CancellationContainer embedded={embedded} title={l.cancel}>
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
    </CancellationContainer>
  );
}

function CancellationContainer({
  embedded,
  title,
  children,
}: {
  embedded: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return embedded ? (
    <div className="stack">{children}</div>
  ) : (
    <Card title={title}>{children}</Card>
  );
}

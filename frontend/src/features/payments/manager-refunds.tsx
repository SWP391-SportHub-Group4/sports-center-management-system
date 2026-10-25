"use client";

import { useRef, useState } from "react";
import { useManagerRequestRead } from "@/lib/manager-request-reads";
import { AsyncSection, Field, Pager, StatusChip } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney, formatPoints } from "@/lib/format";
import { pagedItems } from "@/lib/paged";
import type { PaymentAdjustmentDto, Paged } from "@/lib/types";
import { MutationFeedback, useMutation } from "@/features/operations";
import { financeStyles as styles } from "@/features/finance";

const VND_PER_POINT = 1000;
const VIEWS = ["REQUESTED", "COMPLETED", "REJECTED", ""] as const;
type ApprovalQuote = {
  systemCalculatedPoints: number;
  remainingPaidVnd: number;
  maxPercent: number;
  centerFault: boolean;
};

function RefundCard({
  r,
  reload,
}: {
  r: PaymentAdjustmentDto;
  reload: () => void;
}) {
  const { t } = useLanguage();
  const cardRef = useRef<HTMLElement>(null);
  useManagerRequestRead("refunds", r.adjustmentId, true, cardRef);
  const l = t.staffWork;
  const f = t.finOps;
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [centerFault, setCenterFault] = useState(false);
  const [percent, setPercent] = useState("");
  const mutation = useMutation();
  const canReview =
    !!r.invoiceItemId &&
    r.status === "REQUESTED" &&
    r.requestedByUserId !== user?.userId;
  const quote = useApi(
    (signal) =>
      canReview
        ? api.get<ApprovalQuote>(
            `/api/refunds/${r.adjustmentId}/approval-quote`,
            {
              signal,
              query: { centerFault },
            },
          )
        : Promise.resolve(null),
    [canReview, r.adjustmentId, centerFault],
  );
  const currentQuote =
    !quote.loading && !quote.error && quote.data?.centerFault === centerFault
      ? quote.data
      : null;
  const customPercent = percent.trim() !== "";
  const percentValue = Number(percent);
  const percentInvalid =
    customPercent &&
    (!Number.isInteger(percentValue) ||
      percentValue < 0 ||
      percentValue > (currentQuote?.maxPercent ?? 0));
  const previewPoints = currentQuote
    ? customPercent
      ? Math.floor(
          Math.floor((currentQuote.remainingPaidVnd * percentValue) / 100) /
            VND_PER_POINT,
        )
      : currentQuote.systemCalculatedPoints
    : 0;
  const approvalDisabled =
    mutation.busy ||
    !currentQuote ||
    percentInvalid ||
    previewPoints <= 0 ||
    reason.trim().length < (centerFault || customPercent ? 10 : 3);

  async function review(approve: boolean) {
    if (approve && approvalDisabled) return;
    const ok = await mutation.run(() =>
      api.post(
        `/api/refunds/${r.adjustmentId}/${approve ? "approve" : "reject"}`,
        {
          reason: reason.trim(),
          ...(approve
            ? {
                centerFault,
                ...(percent.trim() !== "" ? { percent: Number(percent) } : {}),
              }
            : {}),
        },
      ),
    );
    if (ok) reload();
    else if (approve) quote.reload();
  }

  return (
    <article className={styles.card} ref={cardRef}>
      <div className={styles.cardHead}>
        <strong>{r.invoiceNumber}</strong>
        <StatusChip value={r.status} />
      </div>
      <p className={styles.muted}>
        {[
          r.requestedByName
            ? f.requestedBy.replace("{name}", r.requestedByName)
            : null,
          r.createdAt ? formatDateTime(r.createdAt) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p>{r.reason}</p>
      <dl className={styles.numbers}>
        <div>
          <dt>{l.systemCap}</dt>
          <dd>
            {formatPoints(
              currentQuote?.systemCalculatedPoints ?? r.systemCalculatedPoints,
            )}{" "}
            (
            {formatMoney(
              (currentQuote?.systemCalculatedPoints ??
                r.systemCalculatedPoints) * VND_PER_POINT,
            )}
            )
          </dd>
        </div>
        {r.status !== "REQUESTED" && (
          <div>
            <dt>{l.approvedPoints}</dt>
            <dd>{formatPoints(r.approvedPoints ?? 0)}</dd>
          </div>
        )}
      </dl>
      {r.pointLedgerEntryId && (
        <p className={styles.muted}>
          {l.ledger}: {r.pointLedgerEntryId}
        </p>
      )}
      {r.status === "REQUESTED" && r.requestedByUserId === user?.userId && (
        <p className={styles.muted}>{l.refundSelf}</p>
      )}
      {canReview && (
        <div className={styles.review}>
          <Field label={l.reviewNote} hint={f.reviewHelp}>
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={centerFault}
              onChange={(e) => {
                setCenterFault(e.target.checked);
                setPercent("");
              }}
            />
            {l.centerFault}
          </label>
          <p className={styles.muted}>{f.centerFaultHelp}</p>
          <Field
            label={f.refundPercent}
            hint={f.refundPercentHelp.replace(
              "{max}",
              String(currentQuote?.maxPercent ?? 0),
            )}
          >
            <input
              type="number"
              min={0}
              max={currentQuote?.maxPercent ?? 0}
              step={1}
              disabled={!currentQuote || mutation.busy}
              aria-invalid={percentInvalid}
              inputMode="numeric"
              value={percent}
              placeholder={f.refundByPolicy}
              onChange={(e) => setPercent(e.target.value)}
            />
          </Field>
          {quote.loading && <p role="status">{t.refactor.loading}</p>}
          {quote.error && <p role="alert">{quote.error.message}</p>}
          {quote.error && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={quote.reload}
            >
              {t.common.retry}
            </button>
          )}
          {percentInvalid && <p role="alert">{f.refundPercentInvalid}</p>}
          {currentQuote && !percentInvalid && (
            <p className={styles.muted}>
              {f.systemCalc
                .replace("{points}", formatPoints(previewPoints))
                .replace("{vnd}", formatMoney(previewPoints * VND_PER_POINT))}
            </p>
          )}
          {(centerFault || customPercent) && (
            <p className={styles.muted}>{f.refundDetailedReason}</p>
          )}
          <div className={styles.actions}>
            <button
              className="btn"
              disabled={approvalDisabled}
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
    </article>
  );
}

/** Hàng đợi hoàn điểm (Q20): mặc định chờ duyệt. Hoàn chỉ bằng điểm. */
export function ManagerRefunds({ onChanged }: { onChanged?: () => void } = {}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const f = t.finOps;
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<(typeof VIEWS)[number]>("REQUESTED");
  const state = useApi(
    (signal) =>
      api.get<Paged<PaymentAdjustmentDto>>("/api/refunds", {
        signal,
        query: { page, pageSize: 20, status },
      }),
    [page, status],
  );
  const labels: Record<(typeof VIEWS)[number], string> = {
    REQUESTED: f.refundWaiting,
    COMPLETED: f.refundCompleted,
    REJECTED: f.refundRejected,
    "": l.all,
  };
  return (
    <div className={styles.page}>
      <p className={styles.muted}>{f.pointsOnly}</p>
      <div className={styles.views} role="group" aria-label={f.refundViews}>
        {VIEWS.map((v) => (
          <button
            key={v || "all"}
            type="button"
            aria-pressed={status === v}
            onClick={() => {
              setStatus(v);
              setPage(1);
            }}
          >
            {labels[v]}
          </button>
        ))}
      </div>
      <AsyncSection state={state}>
        {(data) => {
          const rows = pagedItems(data);
          return (
            <>
              {!rows.length && <p className={styles.muted}>{f.emptyRefunds}</p>}
              {rows.map((r) => (
                <RefundCard
                  key={`${r.adjustmentId}-${r.status}`}
                  r={r}
                  reload={() => {
                    state.reload();
                    onChanged?.();
                  }}
                />
              ))}
              <Pager
                page={data.page}
                pageSize={data.pageSize}
                totalCount={data.totalCount}
                onChange={setPage}
              />
            </>
          );
        }}
      </AsyncSection>
    </div>
  );
}

"use client";

import { useState } from "react";
import { AsyncSection, Field, Pager, StatusChip } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney, formatPoints } from "@/lib/format";
import { pagedItems } from "@/lib/paged";
import type { PaymentAdjustmentDto, Paged } from "@/lib/types";
import { MutationFeedback, useMutation } from "@/features/operations";
import styles from "@/features/finance/finance.module.css";

const VND_PER_POINT = 1000;
const VIEWS = ["REQUESTED", "COMPLETED", "REJECTED", ""] as const;

function RefundCard({
  r,
  reload,
}: {
  r: PaymentAdjustmentDto;
  reload: () => void;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const f = t.finOps;
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [centerFault, setCenterFault] = useState(false);
  const mutation = useMutation();
  const canReview =
    r.status === "REQUESTED" && r.requestedByUserId !== user?.userId;

  async function review(approve: boolean) {
    const ok = await mutation.run(() =>
      api.post(
        `/api/refunds/${r.adjustmentId}/${approve ? "approve" : "reject"}`,
        {
          reason: reason.trim(),
          ...(approve ? { centerFault } : {}),
        },
      ),
    );
    if (ok) reload();
  }

  return (
    <article className={styles.card}>
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
            {formatPoints(r.systemCalculatedPoints)} (
            {formatMoney(r.systemCalculatedPoints * VND_PER_POINT)})
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
      {r.status === "REQUESTED" && !canReview && (
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
              onChange={(e) => setCenterFault(e.target.checked)}
            />
            {l.centerFault}
          </label>
          <p className={styles.muted}>{f.centerFaultHelp}</p>
          <div className={styles.actions}>
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
    </article>
  );
}

/** Hàng đợi hoàn điểm (Q20): mặc định chờ duyệt; lịch sử cũ chỉ đọc. Hoàn chỉ bằng điểm. */
export function ManagerRefunds() {
  const { t } = useLanguage();
  const l = t.staffWork;
  const f = t.finOps;
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<(typeof VIEWS)[number]>("REQUESTED");
  const [legacy, setLegacy] = useState(false);
  const state = useApi(
    (signal) =>
      api.get<Paged<PaymentAdjustmentDto>>(
        legacy ? "/api/payment-adjustments" : "/api/refunds",
        {
          signal,
          query: { page, pageSize: 20, status },
        },
      ),
    [page, status, legacy],
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
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={legacy}
          onChange={(e) => {
            setLegacy(e.target.checked);
            setPage(1);
          }}
        />
        {l.legacy}
      </label>
      <AsyncSection state={state}>
        {(data) => {
          const rows = pagedItems(data);
          return (
            <>
              {!rows.length && <p className={styles.muted}>{f.emptyRefunds}</p>}
              {rows.map((r) =>
                legacy || !r.invoiceItemId ? (
                  <article key={r.adjustmentId} className={styles.card}>
                    <div className={styles.cardHead}>
                      <strong>{r.invoiceNumber}</strong>
                      <StatusChip value={r.status} />
                    </div>
                    <p>{r.reason}</p>
                    <p className={styles.muted}>
                      {l.legacy} · {formatMoney(r.amount)}
                    </p>
                  </article>
                ) : (
                  <RefundCard
                    key={`${r.adjustmentId}-${r.status}`}
                    r={r}
                    reload={state.reload}
                  />
                ),
              )}
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

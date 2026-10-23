"use client";

import { useRef, useState } from "react";
import { AsyncSection } from "@/components/ui";
import { api, ApiError } from "@/lib/apiClient";
import {
  BANK_REFUND_STATUS_LABELS,
  ITEM_TYPE_LABELS,
  formatVnd,
  type BankRefundView,
} from "@/lib/bank-refund";
import { formatDate, formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { SupportImagePicker } from "./image-picker";
import { SupportImages } from "./support-images";
import styles from "./support-refund.module.css";

export type RefundViewerRole = "member" | "receptionist" | "manager";
type Attachment = { attachmentId: string; fileName: string };

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0");
}

function localInput(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/**
 * Bank-refund details of a PAYMENT ticket: service snapshot, policy suggestion, account, decision and result.
 * Members and the front desk only read it; the center manager approves, rejects and records the transfer.
 */
export function BankRefundPanel({
  requestId,
  role,
  proofs = [],
  onChanged,
}: {
  requestId: string;
  role: RefundViewerRole;
  /** Transfer receipt images (kind PAYOUT_PROOF) of the ticket. */
  proofs?: Attachment[];
  onChanged?: () => void;
}) {
  const view = useApi(
    (signal) =>
      api.get<BankRefundView>(`/api/bank-refunds/by-request/${requestId}`, {
        signal,
      }),
    [requestId],
  );
  return (
    <AsyncSection state={view}>
      {(data) => (
        <PanelBody
          data={data}
          role={role}
          proofs={proofs}
          reload={() => {
            view.reload();
            onChanged?.();
          }}
        />
      )}
    </AsyncSection>
  );
}

function Money({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{formatVnd(value)}</dd>
    </div>
  );
}

function PanelBody({
  data,
  role,
  proofs,
  reload,
}: {
  data: BankRefundView;
  role: RefundViewerRole;
  proofs: Attachment[];
  reload: () => void;
}) {
  const { service: s, policy: p } = data;
  const isManager = role === "manager";
  return (
    <div className={styles.panel} data-status={data.status}>
      <header className={styles.panelHead}>
        <strong>Refund to bank account</strong>
        <span className={styles.statusPill} data-status={data.status}>
          {BANK_REFUND_STATUS_LABELS[data.status] ?? data.status}
        </span>
      </header>

      {data.needsReconciliation && (
        <p className={styles.warn} role="status">
          Marked for manual reconciliation: a transfer may already have been
          sent. Check the bank statement before transferring anything again.
          {data.reconciliationNote ? ` Note: ${data.reconciliationNote}` : ""}
        </p>
      )}
      {data.frozen && data.status === "PENDING" && (
        <p className={styles.hint}>
          Figures are from the time of the request; the service can no longer be
          read live.
        </p>
      )}

      <section aria-label="Transaction">
        <h5>Transaction</h5>
        <dl className={styles.facts}>
          <div>
            <dt>Service</dt>
            <dd>
              {ITEM_TYPE_LABELS[s.itemType] ?? s.itemType}: {s.description}
            </dd>
          </div>
          <div>
            <dt>Invoice</dt>
            <dd>
              {s.invoiceNumber}
              {s.invoicePaidAt ? ` · paid ${formatDate(s.invoicePaidAt)}` : ""}
            </dd>
          </div>
          <Money label="Item value" value={s.lineAmount} />
          <Money label="Paid in cash" value={s.paidCashVnd} />
          <Money label="Paid with points" value={s.paidPointsVnd} />
          <Money label="Earlier point refunds" value={s.priorPointRefundVnd} />
          <Money label="Earlier bank refunds" value={s.priorBankRefundVnd} />
          <div>
            <dt>Still refundable</dt>
            <dd>
              <strong>{formatVnd(s.remainingRefundableVnd)}</strong>
            </dd>
          </div>
          <div>
            <dt>Benefit status</dt>
            <dd>{s.entitlementStatus}</dd>
          </div>
          {(s.startDate || s.startAtUtc) && (
            <div>
              <dt>Starts</dt>
              <dd>
                {s.startDate
                  ? formatDate(s.startDate)
                  : formatDateTime(s.startAtUtc)}
              </dd>
            </div>
          )}
          {s.endDate && (
            <div>
              <dt>Ends</dt>
              <dd>{formatDate(s.endDate)}</dd>
            </div>
          )}
          {s.totalUnits !== null && s.unitLabel && (
            <div>
              <dt>Used / unused {s.unitLabel}</dt>
              <dd>
                {s.usedUnits ?? 0} used · {s.unusedUnits ?? 0} unused of{" "}
                {s.totalUnits}
              </dd>
            </div>
          )}
        </dl>
        {s.notes.length > 0 && (
          <ul className={styles.notes}>
            {s.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {s.priorRefunds.length > 0 && (
          <details className={styles.details}>
            <summary>
              Earlier refunds on this item ({s.priorRefunds.length})
            </summary>
            <ul className={styles.notes}>
              {s.priorRefunds.map((r, i) => (
                <li key={`${r.kind}-${i}`}>
                  {formatDateTime(r.at)} ·{" "}
                  {r.kind.replace("_", " ").toLowerCase()} ·{" "}
                  {formatVnd(r.amountVnd)}
                  {r.points ? ` (${r.points} points)` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {role !== "member" && (
        <section aria-label="Policy suggestion">
          <h5>Policy suggestion</h5>
          <dl className={styles.facts}>
            <div>
              <dt>Policy rate</dt>
              <dd>{p.percent}%</dd>
            </div>
            <div>
              <dt>Suggested amount</dt>
              <dd>
                <strong>{formatVnd(p.suggestedVnd)}</strong>
              </dd>
            </div>
            <div>
              <dt>If center fault</dt>
              <dd>
                {p.centerFaultPercent}% · {formatVnd(p.centerFaultSuggestedVnd)}
              </dd>
            </div>
          </dl>
          <p className={styles.hint}>{p.basis}</p>
          <p className={styles.hint}>Center fault: {p.centerFaultBasis}</p>
          <p className={styles.hint}>
            Evaluated at the time of the request (
            {formatDateTime(p.evaluatedAtUtc)}). {p.disclaimer}
          </p>
        </section>
      )}

      <section aria-label="Bank account">
        <h5>Member bank account</h5>
        <dl className={styles.facts}>
          <div>
            <dt>Bank</dt>
            <dd>{data.account.bankName}</dd>
          </div>
          <div>
            <dt>Account number</dt>
            <dd>{data.account.accountNumber}</dd>
          </div>
          <div>
            <dt>Account holder</dt>
            <dd>{data.account.accountHolder}</dd>
          </div>
        </dl>
        {data.account.masked && (
          <p className={styles.hint}>
            The full number is only shown to the manager.
          </p>
        )}
      </section>

      {data.approvedAmount !== null && (
        <section aria-label="Decision">
          <h5>Decision</h5>
          <dl className={styles.facts}>
            <Money label="Approved amount" value={data.approvedAmount} />
            <div>
              <dt>Approved by</dt>
              <dd>
                {data.approvedByName ?? "Manager"}
                {data.approvedAt ? ` · ${formatDateTime(data.approvedAt)}` : ""}
              </dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>
                {data.approvalReason}
                {data.centerFault ? " (center fault)" : ""}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {data.status === "REJECTED" && (
        <section aria-label="Rejection">
          <h5>Why it was not approved</h5>
          <p className={styles.message}>{data.rejectionReason}</p>
        </section>
      )}

      {data.payout && (
        <section aria-label="Transfer result">
          <h5>Transfer</h5>
          <dl className={styles.facts}>
            <Money label="Amount transferred" value={data.payout.amount} />
            <div>
              <dt>Transferred at</dt>
              <dd>{formatDateTime(data.payout.transferredAt)}</dd>
            </div>
            {data.payout.reference && (
              <div>
                <dt>Bank reference</dt>
                <dd>{data.payout.reference}</dd>
              </div>
            )}
            <div>
              <dt>Reason for the refund</dt>
              <dd>{data.payout.note}</dd>
            </div>
            <div>
              <dt>Recorded by</dt>
              <dd>
                {data.payout.paidByName ?? "Manager"} ·{" "}
                {formatDateTime(data.payout.recordedAtUtc)}
              </dd>
            </div>
          </dl>
          {proofs.length > 0 && (
            <>
              <h5>Transfer receipt</h5>
              <SupportImages attachments={proofs} label="Transfer receipt" />
            </>
          )}
        </section>
      )}

      {isManager && data.status === "PENDING" && (
        <ApproveForm data={data} reload={reload} />
      )}
      {isManager && data.status === "APPROVED_AWAITING_PAYOUT" && (
        <>
          <PayoutForm data={data} reload={reload} />
          <ApproveForm data={data} reload={reload} adjust />
        </>
      )}
      {!isManager && data.status === "APPROVED_AWAITING_PAYOUT" && (
        <p className={styles.hint}>
          Approved. The manager will transfer the money to the account above and
          record the receipt here; this ticket closes when that is done.
        </p>
      )}
    </div>
  );
}

function useRun(reload: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  async function run(task: () => Promise<unknown>): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
      reload();
      return true;
    } catch (e) {
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function ApproveForm({
  data,
  reload,
  adjust = false,
}: {
  data: BankRefundView;
  reload: () => void;
  adjust?: boolean;
}) {
  const { policy: p, service: s } = data;
  const [centerFault, setCenterFault] = useState(data.centerFault);
  const suggested = centerFault ? p.centerFaultSuggestedVnd : p.suggestedVnd;
  const [amount, setAmount] = useState(
    String(data.approvedAmount ?? (suggested > 0 ? suggested : "")),
  );
  const [reason, setReason] = useState(data.approvalReason ?? "");
  const [rejectReason, setRejectReason] = useState("");
  const { busy, error, run } = useRun(reload);
  const value = Number(amount);
  const valid =
    Number.isInteger(value) &&
    value > 0 &&
    value <= s.remainingRefundableVnd &&
    reason.trim().length >= (value !== suggested || centerFault ? 10 : 3);
  const note =
    !Number.isInteger(value) || value <= 0
      ? "Enter a whole amount of VND."
      : value > s.remainingRefundableVnd
        ? `The amount cannot exceed ${formatVnd(s.remainingRefundableVnd)}.`
        : reason.trim().length < (value !== suggested || centerFault ? 10 : 3)
          ? value !== suggested || centerFault
            ? "Explain the decision in at least 10 characters (it differs from the suggestion or marks center fault)."
            : "Write a reason."
          : null;

  return (
    <section
      className={styles.form}
      aria-label={adjust ? "Adjust approval" : "Decide"}
    >
      <h5>
        {adjust ? "Adjust the approved amount" : "Decide on this request"}
      </h5>
      {!adjust && (
        <p className={styles.hint}>
          Approving ends the member&apos;s benefit immediately and reserves the
          amount so it cannot also be refunded as points. It does not move any
          money: you transfer it yourself next.
        </p>
      )}
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={centerFault}
          disabled={busy}
          onChange={(e) => {
            setCenterFault(e.target.checked);
            if (!data.approvedAmount) {
              const next = e.target.checked
                ? p.centerFaultSuggestedVnd
                : p.suggestedVnd;
              setAmount(next > 0 ? String(next) : "");
            }
          }}
        />
        <span>The center was at fault</span>
      </label>
      <label className={styles.field}>
        <span>Amount to refund (VND) — suggestion {formatVnd(suggested)}</span>
        <input
          inputMode="numeric"
          value={amount}
          disabled={busy}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </label>
      <label className={styles.field}>
        <span>Reason</span>
        <textarea
          rows={3}
          maxLength={500}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {note && <p className={styles.hint}>{note}</p>}
      <div className={styles.actions}>
        <button
          type="button"
          className="btn"
          disabled={busy || !valid}
          onClick={() =>
            run(() =>
              api.post(
                `/api/bank-refunds/by-request/${data.supportRequestId}/approve`,
                {
                  amount: value,
                  reason: reason.trim(),
                  centerFault,
                },
              ),
            )
          }
        >
          {adjust ? "Update approval" : "Approve refund"}
        </button>
      </div>
      {!adjust && (
        <div className={styles.rejectBox}>
          <label className={styles.field}>
            <span>Or reject (reason required)</span>
            <textarea
              rows={2}
              maxLength={500}
              value={rejectReason}
              disabled={busy}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy || rejectReason.trim().length < 3}
            onClick={() =>
              run(() =>
                api.post(
                  `/api/bank-refunds/by-request/${data.supportRequestId}/reject`,
                  {
                    reason: rejectReason.trim(),
                  },
                ),
              )
            }
          >
            Reject request
          </button>
        </div>
      )}
      {error && (
        <p className={styles.problem} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function PayoutForm({
  data,
  reload,
}: {
  data: BankRefundView;
  reload: () => void;
}) {
  const approved = data.approvedAmount ?? 0;
  const key = useRef(newKey());
  const [amount, setAmount] = useState(String(approved));
  const [at, setAt] = useState(localInput(new Date()));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [flag, setFlag] = useState("");
  const { busy, error, run } = useRun(reload);
  const ready =
    Number(amount) === approved &&
    at !== "" &&
    note.trim().length >= 10 &&
    files.length >= 1 &&
    confirmed;

  async function submit() {
    const form = new FormData();
    form.append("completionKey", key.current);
    form.append("payoutAmount", String(Number(amount)));
    form.append("transferredAt", new Date(at).toISOString());
    if (reference.trim()) form.append("bankReference", reference.trim());
    form.append("note", note.trim());
    files.forEach((f) => form.append("files", f));
    await run(() =>
      api.postForm(
        `/api/bank-refunds/by-request/${data.supportRequestId}/complete`,
        form,
      ),
    );
  }

  return (
    <section className={styles.form} aria-label="Record the transfer">
      <h5>Record the bank transfer</h5>
      <p className={styles.hint}>
        Transfer {formatVnd(approved)} to {data.account.accountHolder} (
        {data.account.bankName} {data.account.accountNumber}) with your bank,
        outside this system. Then record it here with the receipt. The ticket is
        only marked done after this step.
      </p>
      <div className={styles.row2}>
        <label className={styles.field}>
          <span>Amount transferred (VND)</span>
          <input
            inputMode="numeric"
            value={amount}
            disabled={busy}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </label>
        <label className={styles.field}>
          <span>Transferred at</span>
          <input
            type="datetime-local"
            value={at}
            max={localInput(new Date())}
            disabled={busy}
            onChange={(e) => setAt(e.target.value)}
          />
        </label>
      </div>
      <label className={styles.field}>
        <span>Bank transaction code (if any)</span>
        <input
          value={reference}
          maxLength={100}
          disabled={busy}
          onChange={(e) => setReference(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span>Reason for the refund (shown to the member)</span>
        <textarea
          rows={3}
          maxLength={500}
          value={note}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <SupportImagePicker
        files={files}
        onChange={setFiles}
        title="Transfer receipt images"
        hint="Required: 1 to 3 images (.jpg, .png or .webp), 5 MB each."
        required
        disabled={busy}
      />
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          I have already transferred this amount to the account above. This
          cannot be undone.
        </span>
      </label>
      {Number(amount) !== approved && (
        <p className={styles.hint}>
          The amount must equal the approved {formatVnd(approved)}. Adjust the
          approval below first if it changed.
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className="btn"
          disabled={busy || !ready}
          onClick={() => void submit()}
        >
          {busy ? "Saving…" : "Mark as refunded"}
        </button>
      </div>
      {error && (
        <p className={styles.problem} role="alert">
          {error} If you are unsure whether the save succeeded, reload before
          trying again; sending the same form twice never records two payouts.
        </p>
      )}
      <details className={styles.details}>
        <summary>The transfer went through but I cannot record it</summary>
        <label className={styles.field}>
          <span>What happened (min. 10 characters)</span>
          <textarea
            rows={2}
            maxLength={500}
            value={flag}
            disabled={busy}
            onChange={(e) => setFlag(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={busy || flag.trim().length < 10}
          onClick={() =>
            run(() =>
              api.post(
                `/api/bank-refunds/by-request/${data.supportRequestId}/flag-payout`,
                {
                  note: flag.trim(),
                },
              ),
            )
          }
        >
          Flag for reconciliation
        </button>
        <p className={styles.hint}>
          This keeps the ticket open and marked for manual reconciliation
          against the bank statement. The system never transfers money, so do
          not transfer again.
        </p>
      </details>
    </section>
  );
}

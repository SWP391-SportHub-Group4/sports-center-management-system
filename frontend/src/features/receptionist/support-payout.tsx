"use client";

import { useRef, useState } from "react";
import { ApiError, api } from "@/lib/apiClient";
import { formatDateTime, formatMoney } from "@/lib/format";
import { paymentSupportErrorCodes } from "@/lib/payment-support-errors";
import type { MemberSupportRequestDto } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { SupportAttachments } from "./support-attachments";
import type { SupportEventDto } from "./support-shared";
import styles from "./support-center.module.css";

type BankDetails = {
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  purgedAtUtc: string | null;
};

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 5 * 1024 * 1024;

export function SupportPayout({
  request,
  events,
  onChanged,
}: {
  request: MemberSupportRequestDto;
  events: SupportEventDto[];
  onChanged: () => void;
}) {
  const bank = useApi(
    (signal) =>
      request.invoiceId
        ? api.get<BankDetails>(
            `/api/member-support-requests/${request.requestId}/bank-details`,
            { signal },
          )
        : Promise.resolve(null),
    [request.requestId, request.invoiceId],
  );
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const lock = useRef(false);
  const payout = request.payout;
  const closed = ["DONE", "REJECTED", "CLOSED"].includes(request.status);
  const reportedNotReceived =
    !payout?.memberConfirmedAtUtc &&
    events.some((event) => event.type === "MEMBER_REPORTED_NOT_RECEIVED");
  const proof = (request.attachments ?? []).filter(
    (attachment) =>
      attachment.kind === "PAYOUT_PROOF" ||
      payout?.proofAttachmentIds.includes(attachment.attachmentId),
  );
  const parsedAmount = Number(amount);
  const fileError =
    files.length > 3
      ? "Attach no more than 3 images."
      : files.some(
            (file) =>
              !allowedTypes.has(file.type) ||
              file.size === 0 ||
              file.size > maxImageBytes,
          )
        ? "Use JPG, PNG or WebP images up to 5 MB each."
        : null;
  const ready =
    Number.isSafeInteger(parsedAmount) &&
    parsedAmount > 0 &&
    files.length >= 1 &&
    !fileError &&
    note.length <= 1000 &&
    transferConfirmed &&
    !!bank.data?.accountNumber;

  async function record() {
    if (!ready || lock.current) return;
    lock.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const form = new FormData();
      form.append("Amount", amount);
      if (note.trim()) form.append("Note", note.trim());
      for (const file of files) form.append("Files", file);
      await api.postForm(
        `/api/member-support-requests/${request.requestId}/payout`,
        form,
      );
      setFeedback("Payout recorded. The member has been notified.");
      setFiles([]);
      setTransferConfirmed(false);
      onChanged();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.code === paymentSupportErrorCodes.payoutAmountExceedsPaid
            ? "Amount exceeds the remaining VNPay payment for this invoice."
            : error.code === paymentSupportErrorCodes.payoutAlreadyRecorded
              ? "A payout has already been recorded for this request. Refresh the request."
              : error.code === paymentSupportErrorCodes.payoutProofRequired
                ? "Attach 1 to 3 payout proof images."
                : error.message
          : "Payout could not be recorded.";
      setFeedback(message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  return (
    <section className={styles.section} aria-label="Payment payout">
      <h4>Bank payout</h4>
      {!request.invoiceId ? (
        <p className={styles.helper}>
          This request has no linked VNPay invoice. Record payout is
          unavailable.
        </p>
      ) : (
        <>
          <p className={styles.helper}>Invoice: {request.invoiceId}</p>
          {bank.loading && (
            <p className={styles.helper}>Loading receiving account…</p>
          )}
          {bank.error && (
            <p role="alert">
              Receiving account could not be loaded.{" "}
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={bank.reload}
              >
                Retry
              </button>
            </p>
          )}
          {bank.data &&
            (bank.data.purgedAtUtc ? (
              <p className={styles.helper}>
                Bank details were removed after the retention period.
              </p>
            ) : (
              <dl className={styles.requestMetadata}>
                <div>
                  <dt>Bank</dt>
                  <dd>{bank.data.bankName}</dd>
                </div>
                <div>
                  <dt>Account</dt>
                  <dd>{bank.data.accountNumber}</dd>
                </div>
                <div>
                  <dt>Account holder</dt>
                  <dd>{bank.data.accountHolder}</dd>
                </div>
              </dl>
            ))}
          {payout ? (
            <div className={styles.box}>
              <strong>Recorded: {formatMoney(payout.amount)}</strong>
              <span>At {formatDateTime(payout.recordedAtUtc)}</span>
              <span>
                {payout.memberConfirmedBy === "MEMBER"
                  ? `Member confirmed receipt on ${formatDateTime(payout.memberConfirmedAtUtc!)}`
                  : payout.memberConfirmedBy === "SYSTEM"
                    ? `Automatically confirmed on ${formatDateTime(payout.memberConfirmedAtUtc!)}`
                    : reportedNotReceived
                      ? "Member reported not received. Follow up in this request."
                      : "Awaiting member receipt confirmation."}
              </span>
              {proof.length > 0 && <SupportAttachments attachments={proof} />}
            </div>
          ) : (
            !closed && (
              <div className={styles.box}>
                <p className={styles.helper}>
                  Complete the bank transfer first, then record the amount and
                  proof here. The server checks the remaining captured VNPay
                  amount.
                </p>
                <label className={styles.field}>
                  Amount transferred (VND)
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={amount}
                    disabled={busy}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  Transfer proof (1–3 images, 5 MB each)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={busy}
                    onChange={(event) =>
                      setFiles(Array.from(event.target.files ?? []))
                    }
                  />
                </label>
                {files.length > 0 && (
                  <p className={styles.helper}>
                    {files.length} image(s) selected
                  </p>
                )}
                {fileError && (
                  <p role="alert" className={styles.helperWarn}>
                    {fileError}
                  </p>
                )}
                <label className={styles.field}>
                  Note (optional)
                  <textarea
                    maxLength={1000}
                    value={note}
                    disabled={busy}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
                <label className={styles.confirmCheck}>
                  <input
                    type="checkbox"
                    checked={transferConfirmed}
                    disabled={busy}
                    onChange={(event) =>
                      setTransferConfirmed(event.target.checked)
                    }
                  />
                  I have completed the bank transfer and checked the amount and
                  proof.
                </label>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !ready}
                  onClick={() => void record()}
                >
                  {busy ? "Recording…" : "Record payout"}
                </button>
              </div>
            )
          )}
          {feedback && (
            <p role="status" className={styles.helper}>
              {feedback}
            </p>
          )}
        </>
      )}
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, Coins, ImagePlus, Trash2 } from "lucide-react";
import { ApiError, api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatDateTime, formatMoney, formatPoints } from "@/lib/format";
import { paymentSupportErrorCodes } from "@/lib/payment-support-errors";
import type {
  MemberSupportRequestDto,
  SupportRefundItemDto,
} from "@/lib/types";
import { SupportAttachments } from "./support-attachments";
import type { SupportEventDto } from "./support-shared";
import styles from "./support-center.module.css";

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
  const [selectedItemId, setSelectedItemId] = useState("");
  const [draft, setDraft] = useState<{
    itemId: string;
    cash: string;
    points: string;
  } | null>(null);
  const [fieldServerError, setFieldServerError] = useState<{
    field: "cash" | "points";
    message: string;
  } | null>(null);
  const [note, setNote] = useState("");
  const [proofFiles, setProofFiles] = useState<{ file: File; url: string }[]>(
    [],
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());
  const files = proofFiles.map((proofFile) => proofFile.file);
  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);
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
  const quote = useApi(
    (signal) =>
      !payout && !closed && request.invoiceId
        ? api.get<{
            invoiceItemId: string | null;
            supportsEnteredPoints?: boolean;
            items: SupportRefundItemDto[];
          }>(
            "/api/member-support-requests/" +
              request.requestId +
              "/payout-quote",
            { signal },
          )
        : Promise.resolve(null),
    [request.requestId, request.invoiceId, !!payout, closed],
  );
  const items = quote.data?.items ?? [];
  const supportsEnteredPoints = quote.data?.supportsEnteredPoints === true;
  const itemId =
    quote.data?.invoiceItemId ?? request.invoiceItemId ?? selectedItemId;
  const item =
    items.find((row) => row.invoiceItemId === itemId) ??
    (items.length === 1 ? items[0] : null);
  const activeDraft = draft?.itemId === item?.invoiceItemId ? draft : null;
  const cash =
    activeDraft?.cash ??
    (item ? String(Math.floor(item.refundableVnpayVnd / 1000) * 1000) : "");
  const points =
    activeDraft?.points ?? (item ? String(item.refundablePoints) : "");
  const cashAmount = Number(cash);
  const pointAmount = Number(points);
  const refundableValue = item?.refundableValueVnd;
  const maxPoints = item
    ? Math.max(
        0,
        Math.min(
          item.maxRefundablePoints ?? item.refundablePoints,
          refundableValue === undefined
            ? item.refundablePoints
            : Math.floor(
                (refundableValue -
                  (Number.isSafeInteger(cashAmount) ? cashAmount : 0)) /
                  1000,
              ),
        ),
      )
    : 0;
  const cashError = !item
    ? null
    : !/^(0|[1-9]\d*)$/.test(cash) || !Number.isSafeInteger(cashAmount)
      ? "Enter a whole VND amount."
      : cashAmount % 1000 !== 0
        ? "Use multiples of 1,000 VND."
        : cashAmount > item.refundableVnpayVnd
          ? `Maximum ${formatMoney(item.refundableVnpayVnd)}.`
          : fieldServerError?.field === "cash"
            ? fieldServerError.message
            : null;
  const pointsError = !item
    ? null
    : !/^(0|[1-9]\d*)$/.test(points) || !Number.isSafeInteger(pointAmount)
      ? "Enter whole points."
      : pointAmount > maxPoints
        ? `Maximum ${formatPoints(maxPoints)} points.`
        : cashAmount === 0 && pointAmount === 0 && !cashError
          ? "Enter cash or points to refund."
          : fieldServerError?.field === "points"
            ? fieldServerError.message
            : null;
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
    !quote.loading &&
    !quote.error &&
    !!item &&
    !cashError &&
    !pointsError &&
    (cashAmount > 0 || pointAmount > 0) &&
    (cashAmount === 0 || files.length >= 1) &&
    !fileError &&
    note.trim().length > 0 &&
    note.length <= 1000 &&
    transferConfirmed;

  function addProofFiles(selected: FileList | null) {
    if (!selected?.length) return;
    const additions = Array.from(selected).filter(
      (file) =>
        !files.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified &&
            existing.type === file.type,
        ),
    );
    if (files.length + additions.length > 3) {
      setUploadError(
        "Attach no more than 3 images. Remove an image to add another.",
      );
      return;
    }
    if (
      additions.some(
        (file) =>
          !allowedTypes.has(file.type) ||
          file.size === 0 ||
          file.size > maxImageBytes,
      )
    ) {
      setUploadError("Use JPG, PNG or WebP images up to 5 MB each.");
      return;
    }
    const added = additions.map((file) => {
      const url = URL.createObjectURL(file);
      previewUrls.current.add(url);
      return { file, url };
    });
    setProofFiles([...proofFiles, ...added]);
    setUploadError(null);
    if (added.length) setTransferConfirmed(false);
  }

  function removeProofFile(url: string) {
    URL.revokeObjectURL(url);
    previewUrls.current.delete(url);
    setProofFiles((current) =>
      current.filter((proofFile) => proofFile.url !== url),
    );
    setUploadError(null);
    setTransferConfirmed(false);
  }

  async function record() {
    if (!ready || lock.current) return;
    if (!supportsEnteredPoints) {
      setFeedback(
        "Cannot record this refund yet: the payment service must be updated to accept separate cash and point amounts.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const form = new FormData();
      form.append("Amount", String(cashAmount));
      form.append("PointsRefunded", String(pointAmount));
      form.append("InvoiceItemId", item!.invoiceItemId);
      if (note.trim()) form.append("Note", note.trim());
      for (const file of files) form.append("Files", file);
      await api.postForm(
        `/api/member-support-requests/${request.requestId}/payout`,
        form,
      );
      setFeedback("Payout recorded. The member has been notified.");
      proofFiles.forEach(({ url }) => {
        URL.revokeObjectURL(url);
        previewUrls.current.delete(url);
      });
      setProofFiles([]);
      setUploadError(null);
      setTransferConfirmed(false);
      onChanged();
    } catch (error) {
      const field =
        error instanceof ApiError &&
        [
          paymentSupportErrorCodes.payoutAmountMismatch,
          paymentSupportErrorCodes.payoutAmountExceedsPaid,
          "payout_amount_invalid",
        ].includes(error.code)
          ? "cash"
          : error instanceof ApiError &&
              [
                "payout_points_exceeds_paid",
                "payout_points_invalid",
                "payout_value_required",
              ].includes(error.code)
            ? "points"
            : null;
      if (field) {
        setFieldServerError({
          field,
          message:
            field === "cash"
              ? "Check the remaining VNPay amount and use multiples of 1,000 VND."
              : "Check the remaining refund value: cash plus points at 1 point = 1,000 VND.",
        });
        setTransferConfirmed(false);
        quote.reload();
      }
      const message =
        error instanceof ApiError
          ? error.code === paymentSupportErrorCodes.payoutAlreadyRecorded
            ? "A payout has already been recorded for this request. Refresh the request."
            : error.code === paymentSupportErrorCodes.payoutProofRequired
              ? "Attach 1 to 3 payout proof images."
              : error.message
          : "Payout could not be recorded.";
      if (!field) setFeedback(message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  return (
    <section className={styles.section} aria-label="Payment payout">
      <h4>Refund payout</h4>
      {!request.invoiceId ? (
        <p className={styles.helper}>
          This request has no linked VNPay invoice. Record payout is
          unavailable.
        </p>
      ) : (
        <>
          <p className={styles.helper}>Invoice: {request.invoiceId}</p>
          {payout ? (
            <div className={styles.box}>
              <strong>Cash transferred: {formatMoney(payout.amount)}</strong>
              {(payout.pointsRefunded ?? 0) > 0 && (
                <span>
                  Returned to wallet: {formatPoints(payout.pointsRefunded!)}
                </span>
              )}
              <span>At {formatDateTime(payout.recordedAtUtc)}</span>
              <span>
                {payout.memberConfirmedBy === "MEMBER"
                  ? `Member confirmed receipt on ${formatDateTime(payout.memberConfirmedAtUtc!)}`
                  : payout.memberConfirmedBy === "SYSTEM"
                    ? `Automatically confirmed on ${formatDateTime(payout.memberConfirmedAtUtc!)}`
                    : reportedNotReceived
                      ? request.status === "DONE"
                        ? "Payout review completed. Receipt has not been confirmed by the member."
                        : request.status === "REJECTED"
                          ? "Payout claim rejected. Receipt has not been confirmed by the member."
                          : "Member reported not received. Awaiting manager review."
                      : "Awaiting member receipt confirmation."}
              </span>
              {proof.length > 0 && <SupportAttachments attachments={proof} />}
            </div>
          ) : (
            !closed && (
              <div className={styles.box}>
                <p className={styles.helper}>
                  Review the selected service, then enter the cash and points to
                  refund. Cash can be refunded as wallet points at 1 point =
                  1,000 VND. The combined refund cannot exceed the remaining
                  refundable service value.
                </p>
                {quote.loading && (
                  <p role="status">Loading refund breakdown…</p>
                )}
                {quote.error && (
                  <div role="alert">
                    <p>{quote.error.message}</p>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={quote.reload}
                    >
                      Retry refund breakdown
                    </button>
                  </div>
                )}
                {quote.data && !supportsEnteredPoints && (
                  <p role="alert" className={styles.fieldError}>
                    This payout service cannot record the entered point amount
                    yet. Ask an administrator to update it before recording a
                    refund.
                  </p>
                )}
                {!quote.loading && !quote.error && items.length > 0 && (
                  <label className={styles.field}>
                    Service to refund
                    <select
                      value={item?.invoiceItemId ?? ""}
                      disabled={
                        busy ||
                        !!request.invoiceItemId ||
                        !!quote.data?.invoiceItemId
                      }
                      onChange={(event) => {
                        setSelectedItemId(event.target.value);
                        setTransferConfirmed(false);
                        setFieldServerError(null);
                        setFeedback(null);
                      }}
                    >
                      <option value="">
                        Choose the service requested by the member
                      </option>
                      {items.map((row) => (
                        <option
                          key={row.invoiceItemId}
                          value={row.invoiceItemId}
                        >
                          {row.description} · {formatMoney(row.totalVnd)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {item && (
                  <div>
                    <h5 className={styles.paymentMethodTitle}>
                      Payment method
                    </h5>
                    <dl
                      className={styles.refundSummary}
                      aria-label="Payment method"
                    >
                      {item.vnpayVnd > 0 && (
                        <div className={styles.refundBankShare}>
                          <dt>
                            <span className={styles.refundMethodLabel}>
                              <Banknote size={18} aria-hidden="true" />
                              Bank transfer (VNPay)
                            </span>
                            <span className={styles.refundMethodHint}>
                              Amount paid by the member
                            </span>
                          </dt>
                          <dd>{formatMoney(item.vnpayVnd)}</dd>
                        </div>
                      )}
                      {item.pointsApplied > 0 && (
                        <div className={styles.refundPointsShare}>
                          <dt>
                            <span className={styles.refundMethodLabel}>
                              <Coins size={18} aria-hidden="true" />
                              Wallet points
                            </span>
                            <span className={styles.refundMethodHint}>
                              Points used by the member (1 point = 1,000 VND)
                            </span>
                          </dt>
                          <dd>
                            {formatPoints(item.pointsApplied)}
                            <span className={styles.refundPointsUnit}>
                              points
                            </span>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
                <label className={styles.field}>
                  Cash amount transferred (VND)
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={cash}
                    disabled={busy || !item}
                    aria-invalid={!!cashError}
                    aria-describedby={
                      cashError ? "payout-cash-error" : undefined
                    }
                    onChange={(event) => {
                      setDraft({
                        itemId: item!.invoiceItemId,
                        cash: event.target.value,
                        points,
                      });
                      setFieldServerError(null);
                      setTransferConfirmed(false);
                    }}
                  />
                </label>
                {cashError && (
                  <p
                    id="payout-cash-error"
                    role="alert"
                    className={styles.fieldError}
                  >
                    {cashError}
                  </p>
                )}
                <label className={styles.field}>
                  Point amount transferred
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={points}
                    disabled={busy || !item}
                    aria-invalid={!!pointsError}
                    aria-describedby={
                      pointsError ? "payout-points-error" : undefined
                    }
                    onChange={(event) => {
                      setDraft({
                        itemId: item!.invoiceItemId,
                        cash,
                        points: event.target.value,
                      });
                      setFieldServerError(null);
                      setTransferConfirmed(false);
                    }}
                  />
                </label>
                {pointsError && (
                  <p
                    id="payout-points-error"
                    role="alert"
                    className={styles.fieldError}
                  >
                    {pointsError}
                  </p>
                )}
                <div className={styles.proofUpload}>
                  <div className={styles.proofUploadHeader}>
                    <span className={styles.proofUploadTitle}>
                      Transfer proof
                    </span>
                    <span className={styles.helper} aria-live="polite">
                      {files.length}/3 images
                    </span>
                  </div>
                  <p id="payout-proof-help" className={styles.helper}>
                    JPG, PNG or WebP, up to 5 MB each. Required for cash
                    refunds.
                  </p>
                  <input
                    ref={picker}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    hidden
                    aria-label="Transfer proof"
                    aria-describedby="payout-proof-help"
                    disabled={busy}
                    onChange={(event) => {
                      addProofFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className={`btn btn--secondary ${styles.proofAddButton}`}
                    disabled={busy || files.length >= 3}
                    onClick={() => picker.current?.click()}
                  >
                    <ImagePlus size={18} aria-hidden="true" />
                    {files.length ? "Add more images" : "Add images"}
                  </button>
                  {proofFiles.length > 0 && (
                    <ul
                      className={styles.proofPreviews}
                      aria-label="Selected transfer proof"
                    >
                      {proofFiles.map(({ file, url }) => (
                        <li key={url} className={styles.proofPreview}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            title={`View ${file.name}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={file.name} />
                          </a>
                          <div className={styles.proofPreviewFooter}>
                            <span title={file.name}>{file.name}</span>
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={`Remove ${file.name}`}
                              title="Remove image"
                              onClick={() => removeProofFile(url)}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(uploadError || fileError) && (
                    <p role="alert" className={styles.fieldError}>
                      {uploadError || fileError}
                    </p>
                  )}
                </div>
                <label className={styles.field}>
                  Note about the call and refund (required)
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
                  {cashAmount === 0
                    ? "I have checked and confirmed the points refund."
                    : pointAmount > 0
                      ? "I have completed the cash transfer, checked the proof and confirmed the points refund."
                      : "I have completed the cash transfer and checked the proof."}
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

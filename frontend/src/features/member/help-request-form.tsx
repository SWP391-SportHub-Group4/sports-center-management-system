"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CloudUpload, Eye, Trash2, XCircle } from "lucide-react";
import { Dialog } from "@/components/ui";
import { api, ApiError } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { paymentSupportErrorCodes } from "@/lib/payment-support-errors";
import {
  SUPPORT_CATEGORIES,
  type SupportCategory,
} from "@/lib/support-categories";
import { pagedItems } from "@/lib/paged";
import { useApi } from "@/lib/useApi";
import type { InvoiceDetailDto, InvoiceSummaryDto, Paged } from "@/lib/types";
import styles from "./help-center.module.css";

const MAX_FILES = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_LENGTH = 2000;
const INVOICE_PAGE_SIZE = 20;

function invoiceLabel(invoice: InvoiceSummaryDto): string {
  return `${invoice.invoiceNumber} · ${invoice.itemDescription || "Service"} · ${formatMoney(invoice.totalAmount)} · ${formatDateTime(invoice.issuedAt)} · ${invoice.status}`;
}

export interface SentRequest {
  reference: string;
  requestId: string;
  category: SupportCategory;
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === paymentSupportErrorCodes.paymentRequestAlreadyOpen)
      return "You already have an open payment request for this invoice. Follow it in My requests.";
    if (error.code === paymentSupportErrorCodes.reconciliationAlreadyResolved)
      return "This payment was already resolved, so a new request is not needed.";
    if (error.code === "payment_request_invoice_required")
      return "Choose one of your invoices.";
    if (error.code === "payment_request_proof_required")
      return "Attach at least one proof image.";
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : "We could not send your request. Please try again.";
}

/** Form to send a new support request. A PAYMENT request also needs an owned invoice and proof images. */
export function HelpRequestForm({
  initialTopic,
  initialInvoiceId,
  onSent,
  onViewRequests,
}: {
  initialTopic?: string;
  initialInvoiceId?: string;
  onSent: () => void;
  onViewRequests: (requestId: string) => void;
}) {
  const { user } = useAuth();
  const [category, setCategory] = useState<SupportCategory | "">(
    SUPPORT_CATEGORIES.some((c) => c.value === initialTopic)
      ? (initialTopic as SupportCategory)
      : initialInvoiceId
        ? "PAYMENT"
        : "",
  );
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId ?? "");
  const [invoiceInput, setInvoiceInput] = useState("");
  const [invoiceTouched, setInvoiceTouched] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceKeyword, setInvoiceKeyword] = useState("");
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceSummaryDto[]>([]);
  const [invoiceTotal, setInvoiceTotal] = useState<number | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState(false);
  const [invoiceReload, setInvoiceReload] = useState(0);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState(-1);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const invoicePicker = useRef<HTMLDivElement>(null);
  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const invoiceListId = useId();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentRequest | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [zoomed, setZoomed] = useState<{ url: string; name: string } | null>(
    null,
  );
  const picker = useRef<HTMLInputElement>(null);
  const isPayment = category === "PAYMENT";

  useEffect(() => {
    const timer = window.setTimeout(
      () => setInvoiceKeyword(invoiceSearch.trim()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [invoiceSearch]);

  useEffect(() => {
    if (!isPayment) return;
    const controller = new AbortController();
    /* eslint-disable react-hooks/set-state-in-effect */
    setInvoiceLoading(true);
    setInvoiceError(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    api
      .get<Paged<InvoiceSummaryDto>>("/api/members/me/invoices", {
        signal: controller.signal,
        query: {
          page: invoicePage,
          pageSize: INVOICE_PAGE_SIZE,
          ...(invoiceKeyword ? { keyword: invoiceKeyword } : {}),
        },
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        const pageItems = pagedItems(result);
        setInvoiceOptions((current) =>
          invoicePage === 1
            ? pageItems
            : [
                ...current,
                ...pageItems.filter(
                  (item) =>
                    !current.some((old) => old.invoiceId === item.invoiceId),
                ),
              ],
        );
        setInvoiceTotal(result.totalCount);
      })
      .catch((cause: unknown) => {
        if (
          !controller.signal.aborted &&
          !(cause instanceof DOMException && cause.name === "AbortError")
        )
          setInvoiceError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setInvoiceLoading(false);
      });
    return () => controller.abort();
  }, [isPayment, invoiceKeyword, invoicePage, invoiceReload]);

  useEffect(() => {
    if (!initialInvoiceId) return;
    const controller = new AbortController();
    api
      .get<InvoiceDetailDto>(`/api/invoices/${initialInvoiceId}`, {
        signal: controller.signal,
      })
      .then((detail) => {
        if (!controller.signal.aborted)
          setInvoiceInput((current) => current || detail.summary.invoiceNumber);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [initialInvoiceId]);

  useEffect(() => {
    if (!invoiceOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!invoicePicker.current?.contains(event.target as Node))
        setInvoiceOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [invoiceOpen]);

  useEffect(() => {
    if (invoiceOpen && activeInvoice >= 0)
      document
        .getElementById(`${invoiceListId}-${activeInvoice}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [invoiceOpen, activeInvoice, invoiceListId]);

  function chooseInvoice(invoice: InvoiceSummaryDto) {
    setInvoiceId(invoice.invoiceId);
    setInvoiceInput(invoice.invoiceNumber);
    setInvoiceSearch("");
    if (invoiceKeyword) {
      setInvoiceOptions([]);
      setInvoiceTotal(null);
      setInvoicePage(1);
      setInvoiceKeyword("");
    }
    setInvoiceOpen(false);
    setActiveInvoice(-1);
    invoiceInputRef.current?.focus();
  }

  // Invoice Breakdown: the VNPay share goes back to the bank (manager transfer), the points share back to the wallet.
  const breakdown = useApi(
    (signal) =>
      isPayment && invoiceId
        ? api.get<{
            totalVnd: number;
            vnpayVnd: number;
            pointsApplied: number;
            pointsVnd: number;
            refundableVnpayVnd: number;
            refundablePoints: number;
          }>(`/api/members/me/invoices/${invoiceId}/refund-breakdown`, {
            signal,
          })
        : Promise.resolve(null),
    [isPayment, invoiceId],
  );

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );
  useEffect(
    () => () => previews.forEach((p) => URL.revokeObjectURL(p.url)),
    [previews],
  );

  const paymentReady = invoiceId !== "" && files.length >= 1;
  const invoiceSearchReady =
    invoiceSearch.trim() === invoiceKeyword && !invoiceLoading;
  const invoiceValidationMessage =
    invoiceTouched && !invoiceId
      ? !invoiceInput.trim()
        ? invoiceOpen
          ? null
          : "Select an invoice."
        : !invoiceSearchReady
          ? null
          : invoiceError
            ? "Could not check this invoice. Open the list and retry."
            : invoiceTotal === 0
              ? "Invoice not found in your account. Check the invoice number."
              : invoiceOpen
                ? null
                : "Choose an invoice from the list to continue."
      : null;
  const ready =
    category !== "" &&
    message.trim().length >= 3 &&
    consent &&
    !busy &&
    (!isPayment || paymentReady);

  function toast(text: string) {
    const id = Date.now() + Math.random();
    setToasts((all) =>
      all.some((t) => t.text === text) ? all : [...all, { id, text }],
    );
    window.setTimeout(
      () => setToasts((all) => all.filter((t) => t.id !== id)),
      4000,
    );
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (!ACCEPT.split(",").includes(file.type)) {
        toast("Only JPG, PNG or WebP images can be attached.");
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast("Each image must be 5 MB or smaller.");
        continue;
      }
      if (next.length >= MAX_FILES) {
        toast(`You can attach up to ${MAX_FILES} images.`);
        break;
      }
      next.push(file);
    }
    setFiles(next);
    if (picker.current) picker.current.value = "";
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || !ready) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("category", category);
      form.append("description", message.trim());
      if (isPayment) {
        form.append("invoiceId", invoiceId);
      }
      files.forEach((file) => form.append("files", file));
      const result = await api.postForm<{
        reference: string;
        requestId: string;
      }>("/api/support/requests", form);
      setSent({ ...result, category });
      setMessage("");
      setFiles([]);
      setConsent(false);
      setInvoiceId("");
      setInvoiceInput("");
      setInvoiceTouched(false);
      onSent();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-label="Contact support">
      <p className={styles.intro}>
        Tell us what you need. Our team will review your request and follow up.
        You will get a notification and an email as soon as it is received, and
        you can follow progress in <strong>My requests</strong>.
      </p>
      {sent ? (
        <div className={styles.success} role="status">
          <h2>Request received</h2>
          <p>
            Your reference is <strong>{sent.reference}</strong>. We have sent a
            confirmation to {user?.email}.
          </p>
          <div className={styles.successActions}>
            <button
              type="button"
              className="btn"
              onClick={() => onViewRequests(sent.requestId)}
            >
              Track this request
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setSent(null)}
            >
              Send another request
            </button>
          </div>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          <label className={styles.field}>
            <span>What is your request about? *</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SupportCategory)}
              required
            >
              <option value="">Select a topic</option>
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Email *</span>
            <input type="email" value={user?.email ?? ""} readOnly />
            <span className={styles.hint}>
              We reply to the email registered on your account.
            </span>
          </label>

          {isPayment && (
            <fieldset className={styles.paymentBox}>
              <legend>Refund details</legend>
              <p className={styles.hint}>
                Already bought services are not refunded when you cancel them
                yourself. Select any invoice to report a payment issue. A bank
                refund requires a confirmed VNPay charge; our manager will call
                the phone number in your profile to review the case.
              </p>
              <div className={styles.field}>
                <label htmlFor="support-invoice">Invoice *</label>
                <div className={styles.invoicePicker} ref={invoicePicker}>
                  <input
                    ref={invoiceInputRef}
                    id="support-invoice"
                    type="search"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-haspopup="listbox"
                    aria-expanded={invoiceOpen}
                    aria-controls={invoiceOpen ? invoiceListId : undefined}
                    aria-activedescendant={
                      invoiceOpen && activeInvoice >= 0
                        ? invoiceListId + "-" + activeInvoice
                        : undefined
                    }
                    aria-required="true"
                    aria-invalid={!!invoiceValidationMessage}
                    aria-describedby={
                      invoiceValidationMessage
                        ? invoiceListId + "-error"
                        : undefined
                    }
                    autoComplete="off"
                    value={invoiceInput}
                    placeholder="Select an invoice or type its number"
                    onFocus={() => setInvoiceOpen(true)}
                    onClick={() => setInvoiceOpen(true)}
                    onBlur={() => setInvoiceTouched(true)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setInvoiceTouched(true);
                      setInvoiceInput(value);
                      setInvoiceSearch(value);
                      setInvoiceId("");
                      setInvoicePage(1);
                      if (value.trim() !== invoiceKeyword) {
                        setInvoiceOptions([]);
                        setInvoiceTotal(null);
                      }
                      setActiveInvoice(-1);
                      setInvoiceOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "ArrowDown" ||
                        event.key === "ArrowUp"
                      ) {
                        event.preventDefault();
                        setInvoiceOpen(true);
                        if (invoiceOptions.length)
                          setActiveInvoice((current) =>
                            event.key === "ArrowDown"
                              ? (current + 1) % invoiceOptions.length
                              : current <= 0
                                ? invoiceOptions.length - 1
                                : current - 1,
                          );
                      } else if (
                        event.key === "Enter" &&
                        invoiceOpen &&
                        activeInvoice >= 0
                      ) {
                        event.preventDefault();
                        chooseInvoice(invoiceOptions[activeInvoice]);
                      } else if (event.key === "Escape") {
                        setInvoiceOpen(false);
                        setActiveInvoice(-1);
                      } else if (event.key === "Tab") {
                        setInvoiceOpen(false);
                      }
                    }}
                  />
                  {invoiceOpen && (
                    <div
                      id={invoiceListId}
                      role="listbox"
                      aria-label="Invoices"
                      className={styles.invoiceOptions}
                      onScroll={(event) => {
                        const list = event.currentTarget;
                        if (
                          !invoiceLoading &&
                          !invoiceError &&
                          invoiceTotal !== null &&
                          invoiceOptions.length < invoiceTotal &&
                          list.scrollHeight -
                            list.scrollTop -
                            list.clientHeight <
                            64
                        ) {
                          setInvoiceLoading(true);
                          setInvoicePage((page) => page + 1);
                        }
                      }}
                    >
                      {invoiceSearch.trim() === invoiceKeyword &&
                        invoiceOptions.map((invoice, index) => (
                          <button
                            key={invoice.invoiceId}
                            id={invoiceListId + "-" + index}
                            type="button"
                            role="option"
                            tabIndex={-1}
                            aria-selected={invoice.invoiceId === invoiceId}
                            className={styles.invoiceOption}
                            data-active={activeInvoice === index || undefined}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setActiveInvoice(index)}
                            onClick={() => chooseInvoice(invoice)}
                          >
                            {invoiceLabel(invoice)}
                          </button>
                        ))}
                      {(invoiceLoading ||
                        invoiceSearch.trim() !== invoiceKeyword) && (
                        <p className={styles.invoiceListNote} role="status">
                          Loading invoices…
                        </p>
                      )}
                      {invoiceError && (
                        <div className={styles.invoiceListNote} role="alert">
                          Could not load invoices.{" "}
                          <button
                            type="button"
                            onClick={() => setInvoiceReload((n) => n + 1)}
                          >
                            Retry
                          </button>
                        </div>
                      )}
                      {!invoiceLoading &&
                        !invoiceError &&
                        invoiceSearch.trim() === invoiceKeyword &&
                        invoiceOptions.length === 0 && (
                          <p className={styles.invoiceListNote}>
                            No invoices found.
                          </p>
                        )}
                    </div>
                  )}
                </div>
                {invoiceValidationMessage && (
                  <span
                    id={invoiceListId + "-error"}
                    className={styles.fieldError}
                    role="alert"
                  >
                    {invoiceValidationMessage}

                  </span>
                )}
              </div>
              {breakdown.data && (
                <dl className={styles.hint} aria-label="Invoice breakdown">
                  <div>
                    <dt>Invoice total</dt>
                    <dd>{formatMoney(breakdown.data.totalVnd)}</dd>
                  </div>
                  <div>
                    <dt>Paid with VNPay</dt>
                    <dd>
                      {formatMoney(breakdown.data.vnpayVnd)}
                      {breakdown.data.vnpayVnd > 0
                        ? " — any approved bank refund is handled by the manager."
                        : " — no confirmed VNPay charge has been recorded."}
                    </dd>
                  </div>
                  {breakdown.data.pointsApplied > 0 && (
                    <div>
                      <dt>Paid with points</dt>
                      <dd>
                        {breakdown.data.pointsApplied} points (
                        {formatMoney(breakdown.data.pointsVnd)}) — returned to
                        your wallet automatically when the payout is recorded.
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </fieldset>
          )}

          <label className={styles.field}>
            <span>{isPayment ? "What happened? *" : "Your message *"}</span>
            <textarea
              value={message}
              maxLength={MAX_LENGTH}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the problem with as much detail as you can"
              required
            />
            <span className={styles.counter}>
              {message.length}/{MAX_LENGTH}
            </span>
          </label>

          <div className={styles.upload}>
            <p className={styles.uploadNote}>
              {isPayment
                ? "Attach 1 to 3 images showing your payment, such as the bank receipt (required)."
                : "Please upload images showing the problem you are facing (optional)."}
            </p>
            <span className={styles.uploadTitle}>
              Upload images{isPayment ? " *" : ""}
            </span>
            <p className={styles.uploadHint}>
              You can attach up to {MAX_FILES} files in .jpg, .jpeg, .png or
              .webp format. Each file must not exceed 5 MB.
            </p>
            <input
              ref={picker}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />
            <button
              type="button"
              className={styles.uploadButton}
              onClick={() => picker.current?.click()}
            >
              <CloudUpload size={18} aria-hidden="true" /> Click to upload (
              {files.length}/{MAX_FILES})
            </button>
            {previews.length > 0 && (
              <ul className={styles.files}>
                {previews.map((p, index) => (
                  <li key={p.url} className={styles.file}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.file.name} />
                    <div className={styles.fileActions}>
                      <button
                        type="button"
                        aria-label={`View ${p.file.name}`}
                        onClick={() =>
                          setZoomed({ url: p.url, name: p.file.name })
                        }
                      >
                        <Eye size={20} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${p.file.name}`}
                        onClick={() =>
                          setFiles(files.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 size={20} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className={styles.consent}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I agree that SportHub may use the details above to handle this
              request. *
            </span>
          </label>

          {error && (
            <p className="alert alert--error" role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <button type="submit" className="btn" disabled={!ready}>
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
      {toasts.length > 0 && (
        <div className={styles.toasts} role="alert">
          {toasts.map((t) => (
            <p key={t.id} className={styles.toast}>
              <XCircle size={18} aria-hidden="true" /> {t.text}
            </p>
          ))}
        </div>
      )}
      {zoomed && (
        <Dialog
          title="Image preview"
          size="lg"
          closeIconOnly
          onClose={() => setZoomed(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.zoomed} src={zoomed.url} alt={zoomed.name} />
        </Dialog>
      )}
    </section>
  );
}

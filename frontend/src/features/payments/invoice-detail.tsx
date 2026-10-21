"use client";
import { api, downloadFile } from "@/lib/apiClient";
import { useAction } from "@/lib/useApi";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatPoints, formatDateTime } from "@/lib/format";
import type { InvoiceDetailDto } from "@/lib/types";
import { Card, StatusChip } from "@/components/ui";
import { RefundRequestForm } from "./refund-request-form";
import { CheckoutPanel } from "./checkout-panel";
import type { ReactNode } from "react";
import { Dialog } from "@/components/ui";
import styles from "./invoice-detail.module.css";

function InvoiceFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  return onClose ? (
    <Dialog title={title} onClose={onClose} size="lg" className={styles.dialog}>
      <div className={styles.detail}>{children}</div>
    </Dialog>
  ) : (
    <Card title={title}>
      <div className={styles.detail}>{children}</div>
    </Card>
  );
}
export function InvoiceDetail({
  invoiceId,
  staff = false,
  rental = false,
  onClose,
}: {
  invoiceId: string;
  staff?: boolean;
  rental?: boolean;
  onClose?: () => void;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const download = useAction();
  const l = t.refactor;
  const f = t.finOps;
  const state = useApi(
    (signal) =>
      api.get<InvoiceDetailDto>(`/api/invoices/${invoiceId}`, { signal }),
    [invoiceId],
  );
  const d = state.data;
  const paid = d ? ["PAID", "PAID_AFTER_RECONCILIATION"].includes(d.summary.status.toUpperCase()) : false;
  const voided = d?.summary.status.toUpperCase() === "VOID";
  const successfulPayments = d?.payments.filter((p) => ["SUCCESS", "SUCCEEDED"].includes(p.status.toUpperCase())) ?? [];
  return (
    <InvoiceFrame title={l.invoice} onClose={onClose}>
      {state.loading ? (
        <p className={styles.message}>{l.loading}</p>
      ) : state.error ? (
        <p className={styles.notice} role="alert">
          {state.error.message}
        </p>
      ) : (
        d && (
          <>
            <div className={styles.identity}>
              {paid && <button
                className="btn btn--secondary"
                disabled={download.busy}
                onClick={() =>
                  void download.run(() =>
                    downloadFile(
                      `/api/invoices/${invoiceId}/receipt.pdf`,
                      `${d.summary.invoiceNumber}.pdf`,
                    ),
                  )
                }
              >
                {download.busy ? "Downloading…" : "Download PDF"}
              </button>}
              {download.error && <p role="alert">{download.error}</p>}
              <p className={styles.invoiceNumber}>{d.summary.invoiceNumber}</p>
              <div className={styles.statuses}>
                <StatusChip value={d.summary.status} />
                <StatusChip value={d.summary.fulfillmentOutcome} />
              </div>
            </div>
            <section className={styles.contextPanel} aria-label="Invoice information">
              <h3 className={styles.sectionTitle}>Invoice information</h3>
              <p className={styles.contextDescription}>
                {voided
                  ? "This invoice is void. The original order is preserved for reference, but it is not an outstanding payment request."
                  : paid
                    ? "Payment has been recorded. Review the transaction and purchased services below."
                    : "This order is awaiting payment. Only a completed payment provides a downloadable receipt."}
              </p>
              <dl className={styles.contextGrid}>
                <div><dt>Invoice number</dt><dd>{d.summary.invoiceNumber}</dd></div>
                <div><dt>Issued on</dt><dd>{formatDateTime(d.summary.issuedAt)}</dd></div>
                <div><dt>Member</dt><dd>{d.summary.memberName || "Not available"}</dd></div>
                <div><dt>Email</dt><dd>{d.summary.memberEmail || "Not available"}</dd></div>
                <div><dt>Payment status</dt><dd><StatusChip value={d.summary.status} /></dd></div>
                <div><dt>{voided ? "Payment obligation" : "Amount outstanding"}</dt>
                  <dd>{voided ? "Cancelled" : formatMoney(d.summary.outstanding)}</dd></div>
                {successfulPayments.length > 0 && (
                  <>
                    <div><dt>Last payment</dt><dd>{formatDateTime(successfulPayments[successfulPayments.length - 1].paidAt)}</dd></div>
                    <div><dt>Payment method</dt><dd>{[...new Set(successfulPayments.map((p) => p.method))].join(", ")}</dd></div>
                    {successfulPayments.some((p) => p.referenceCode) &&
                      <div><dt>Transaction reference</dt><dd>{successfulPayments.map((p) => p.referenceCode).filter(Boolean).join(", ")}</dd></div>}
                  </>
                )}
              </dl>
            </section>
            <section className={styles.contents} aria-label={f.invoiceContents}>
              <h3 className={styles.sectionTitle}>{f.invoiceContents}</h3>
              <ul className={styles.items}>
                {d.items.map((i) => {
                  const typeKey = i.itemType
                    ?.replace(/([a-z])([A-Z])/g, "$1_$2")
                    .toUpperCase() as keyof typeof f.invoiceTypes;
                  const typeLabel = f.invoiceTypes[typeKey];
                  return (
                    <li key={i.itemId}>
                      <div className={styles.itemContent}>
                        {typeLabel && (
                          <h4 className={styles.itemType}>{typeLabel}</h4>
                        )}
                        <p className={styles.itemDescription}>{i.description}</p>
                        <dl className={styles.serviceMeta}>
                          <div><dt>Service type</dt><dd>{i.itemType.replaceAll("_", " ")}</dd></div>
                          {i.sportName && <div><dt>Sport</dt><dd>{i.sportName}</dd></div>}
                          {i.classId != null && <div><dt>Class ID</dt><dd>{i.classId}</dd></div>}
                          {i.courtRentalId && <div><dt>Rental reference</dt><dd>{i.courtRentalId}</dd></div>}
                          <div><dt>Quantity</dt><dd>{i.quantity}</dd></div>
                          <div><dt>Unit price</dt><dd>{formatMoney(i.unitPrice)}</dd></div>
                        </dl>
                      </div>
                      <span className={styles.amount}>
                        {formatMoney(i.lineAmount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className={styles.payment} aria-label={f.invoicePayment}>
              <h3 className={styles.sectionTitle}>{f.invoicePayment}</h3>
              <dl className={styles.summary}>
                <div className={styles.total}>
                  <dt>{l.total}</dt>
                  <dd>{formatMoney(d.summary.totalAmount)}</dd>
                </div>
                <div className={styles.paymentMethods}>
                  <dt>{f.invoicePaymentMethod}</dt>
                  <dd>
                    <ul className={styles.methods}>
                      {(d.summary.pointsSpent ?? 0) > 0 && (
                        <li>
                          <span>{l.points}</span>
                          <span className={styles.amount}>
                            {formatPoints(d.summary.pointsSpent)}{" "}
                            {l.points.toLowerCase()}
                          </span>
                        </li>
                      )}
                      {(d.summary.cashAmount ?? 0) > 0 && (
                        <li>
                          <span>{l.cash}</span>
                          <span className={styles.amount}>
                            {formatMoney(d.summary.cashAmount)}
                          </span>
                        </li>
                      )}
                      {(d.summary.pointsSpent ?? 0) <= 0 &&
                        (d.summary.cashAmount ?? 0) <= 0 && (
                          <li>{f.invoicePaymentMethodUnknown}</li>
                        )}
                    </ul>
                  </dd>
                </div>
              </dl>
            </section>
            {d.summary.reconciliationRequired && (
              <p className={styles.notice}>{l.reconciliation}</p>
            )}
            {d.summary.fulfillmentOutcome === "COMPENSATED" && (
              <p className={styles.notice}>{l.compensated}</p>
            )}
            {d.adjustments.length > 0 && (
              <h3 className={styles.sectionTitle}>{f.invoiceRefunds}</h3>
            )}
            <ul className={styles.adjustments}>
              {d.adjustments.map((a) => (
                <li key={a.adjustmentId}>
                  <div className={styles.adjustmentHead}>
                    <StatusChip value={a.status} />
                    <span className={styles.amount}>
                      {formatPoints(
                        a.status === "REQUESTED"
                          ? a.systemCalculatedPoints
                          : (a.approvedPoints ?? 0),
                      )}{" "}
                      {l.points}
                    </span>
                  </div>
                  <p className={styles.reason}>{a.reason}</p>
                </li>
              ))}
            </ul>
            {d.summary.status === "ISSUED" &&
              d.summary.checkoutExpiresAtUtc === null && (
                <p className={styles.notice}>{l.legacyInvoice}</p>
              )}
            {d.summary.status === "ISSUED" &&
              d.summary.checkoutExpiresAtUtc !== null && (
                <CheckoutPanel
                  key={invoiceId}
                  invoiceId={invoiceId}
                  memberId={staff ? d.summary.memberId : undefined}
                  onChange={state.reload}
                />
              )}
            {paid && !rental && user?.role !== "CenterManager" && (
              <div className={styles.refundArea}>
                <RefundRequestForm items={d.items} onChange={state.reload} />
              </div>
            )}
          </>
        )
      )}
    </InvoiceFrame>
  );
}

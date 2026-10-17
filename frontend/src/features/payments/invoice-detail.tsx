"use client";
import { api, downloadFile } from "@/lib/apiClient";
import { useAction } from "@/lib/useApi";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatPoints } from "@/lib/format";
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
              <button
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
              </button>
              {download.error && <p role="alert">{download.error}</p>}
              <p className={styles.invoiceNumber}>{d.summary.invoiceNumber}</p>
              <div className={styles.statuses}>
                <StatusChip value={d.summary.status} />
                <StatusChip value={d.summary.fulfillmentOutcome} />
              </div>
            </div>
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
                        <p className={styles.itemDescription}>
                          {i.description}
                        </p>
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
            {!rental && user?.role !== "CenterManager" && (
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

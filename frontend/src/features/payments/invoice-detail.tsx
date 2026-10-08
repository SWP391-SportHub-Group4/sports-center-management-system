"use client";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  formatMoney,
  formatPoints,
  formatDateTime,
  formatTime,
} from "@/lib/format";
import type { InvoiceDetailDto } from "@/lib/types";
import { Card, StatusChip } from "@/components/ui";
import { RefundRequestForm } from "./refund-request-form";
import { CheckoutPanel } from "./checkout-panel";
import styles from "./invoice-detail.module.css";
export function InvoiceDetail({
  invoiceId,
  staff = false,
  rental = false,
}: {
  invoiceId: string;
  staff?: boolean;
  rental?: boolean;
}) {
  const { t } = useLanguage();
  const l = t.refactor;
  const state = useApi(
    (signal) =>
      api.get<InvoiceDetailDto>(`/api/invoices/${invoiceId}`, { signal }),
    [invoiceId],
  );
  const d = state.data;
  return (
    <Card
      title={d ? `${l.invoice} ${d.summary.invoiceNumber}` : l.invoice}
      hint={
        d
          ? `${d.summary.memberName || d.summary.memberEmail} · ${formatDateTime(d.summary.issuedAt)}`
          : undefined
      }
      actions={
        d && (
          <>
            <StatusChip value={d.summary.status} />
            <StatusChip value={d.summary.fulfillmentOutcome} />
          </>
        )
      }
    >
      {state.loading ? (
        <p>{l.loading}</p>
      ) : state.error ? (
        <p role="alert">{state.error.message}</p>
      ) : (
        d && (
          <div className={styles.content}>
            <dl className={styles.totals}>
              <div>
                <dt>{l.total}</dt>
                <dd>{formatMoney(d.summary.totalAmount)}</dd>
              </div>
              <div>
                <dt>{t.operationsUx.paidPoints}</dt>
                <dd>
                  {formatPoints(d.summary.pointsSpent ?? 0)}{" "}
                  {l.points.toLowerCase()}
                </dd>
                <span>
                  {t.operationsUx.pointValue}:{" "}
                  {formatMoney((d.summary.pointsSpent ?? 0) * 1000)}
                </span>
              </div>
              <div>
                <dt>{t.operationsUx.paidCash}</dt>
                <dd>{formatMoney(d.summary.cashAmount ?? 0)}</dd>
              </div>
            </dl>
            {d.summary.reconciliationRequired && <p>{l.reconciliation}</p>}
            {d.summary.fulfillmentOutcome === "COMPENSATED" && (
              <p>{l.compensated}</p>
            )}
            <section className={styles.services}>
              <h3>{t.operationsUx.invoiceItems}</h3>
              <ul className={styles.items}>
                {d.items.map((i) => (
                  <li key={i.itemId} className={styles.item}>
                    <div>
                      <strong>
                        {i.itemType === "RENTAL"
                          ? `${t.operationsUx.rental}${i.sportName ? ` · ${i.sportName}` : ""}`
                          : i.description}
                      </strong>
                      {i.roomName && <p>{i.roomName}</p>}
                      {i.rentalStartAtUtc && i.rentalEndAtUtc ? (
                        <p>
                          {formatDateTime(i.rentalStartAtUtc)}–
                          {formatTime(i.rentalEndAtUtc)} ·{" "}
                          {(new Date(i.rentalEndAtUtc).getTime() -
                            new Date(i.rentalStartAtUtc).getTime()) /
                            3600000}{" "}
                          {t.operationsUx.hours}
                        </p>
                      ) : (
                        <p>
                          {t.operationsUx.quantity}: {i.quantity} ·{" "}
                          {t.operationsUx.unitPrice}: {formatMoney(i.unitPrice)}
                        </p>
                      )}
                    </div>
                    <strong className={styles.amount}>
                      {formatMoney(i.lineAmount)}
                    </strong>
                  </li>
                ))}
              </ul>
            </section>
            {d.adjustments.length > 0 && (
              <section className={styles.services}>
                <h3>{t.operationsUx.refunds}</h3>
                <ul className={styles.items}>
                  {d.adjustments.map((a) => (
                    <li key={a.adjustmentId} className={styles.adjustment}>
                      <StatusChip value={a.status} />
                      <span>
                        {formatPoints(
                          a.status === "REQUESTED"
                            ? a.systemCalculatedPoints
                            : (a.approvedPoints ?? 0),
                        )}{" "}
                        {l.points.toLowerCase()}
                      </span>
                      <span className={styles.muted}>{a.reason}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {d.summary.status === "ISSUED" &&
              d.summary.checkoutExpiresAtUtc === null && (
                <p>{l.legacyInvoice}</p>
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
            {!rental && (
              <RefundRequestForm
                items={d.items}
                onChange={state.reload}
                staff={staff}
              />
            )}
          </div>
        )
      )}
    </Card>
  );
}

"use client";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatPoints } from "@/lib/format";
import type { InvoiceDetailDto } from "@/lib/types";
import { Card, StatusChip } from "@/components/ui";
import { RefundRequestForm } from "./refund-request-form";
import { CheckoutPanel } from "./checkout-panel";
import type { ReactNode } from "react";
import { Dialog } from "@/components/ui";
import { useInvoiceItemLabels } from "./invoice-item-labels";

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
    <Dialog title={title} onClose={onClose} size="lg">
      <div className="stack">{children}</div>
    </Dialog>
  ) : (
    <Card title={title}>{children}</Card>
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
  const l = t.refactor;
  const state = useApi(
    (signal) =>
      api.get<InvoiceDetailDto>(`/api/invoices/${invoiceId}`, { signal }),
    [invoiceId],
  );
  const d = state.data;
  const itemLabel = useInvoiceItemLabels(d?.items ?? []);
  return (
    <InvoiceFrame
      title={d?.summary.invoiceNumber ?? l.invoice}
      onClose={onClose}
    >
      {state.loading ? (
        <p>{l.loading}</p>
      ) : state.error ? (
        <p role="alert">{state.error.message}</p>
      ) : (
        d && (
          <>
            <p>
              {d.summary.invoiceNumber} ·{" "}
              <StatusChip value={d.summary.status} /> ·{" "}
              <StatusChip value={d.summary.fulfillmentOutcome} />
            </p>
            <p>
              {l.total}: {formatMoney(d.summary.totalAmount)} · {l.points}:{" "}
              {formatPoints(d.summary.pointsSpent ?? 0)} · {l.cash}:{" "}
              {formatMoney(d.summary.cashAmount ?? 0)}
            </p>
            {d.summary.reconciliationRequired && <p>{l.reconciliation}</p>}
            {d.summary.fulfillmentOutcome === "COMPENSATED" && (
              <p>{l.compensated}</p>
            )}
            <ul>
              {d.items.map((i) => (
                <li key={i.itemId}>
                  {itemLabel(i)} · {formatMoney(i.lineAmount)}
                </li>
              ))}
            </ul>
            <ul>
              {d.adjustments.map((a) => (
                <li key={a.adjustmentId}>
                  <StatusChip value={a.status} /> ·{" "}
                  {formatPoints(
                    a.status === "REQUESTED"
                      ? a.systemCalculatedPoints
                      : (a.approvedPoints ?? 0),
                  )}{" "}
                  {l.points} · {a.reason}
                </li>
              ))}
            </ul>
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
              <RefundRequestForm items={d.items} onChange={state.reload} />
            )}
          </>
        )
      )}
    </InvoiceFrame>
  );
}

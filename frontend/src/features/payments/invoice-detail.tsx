"use client";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatPoints } from "@/lib/format";
import type { InvoiceDetailDto } from "@/lib/types";
import { Card, StatusChip } from "@/components/ui";
import { RefundRequestForm } from "./refund-request-form";
import { CheckoutPanel } from "./checkout-panel";
export function InvoiceDetail({
  invoiceId,
  staff = false,
}: {
  invoiceId: string;
  staff?: boolean;
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
    <Card title={l.invoice}>
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
                  {i.description} · {formatMoney(i.lineAmount)}
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
            {d.summary.status === "ISSUED" && (
              <CheckoutPanel
                key={invoiceId}
                invoiceId={invoiceId}
                memberId={staff ? d.summary.memberId : undefined}
                onChange={state.reload}
              />
            )}
            <RefundRequestForm items={d.items} onChange={state.reload} />
          </>
        )
      )}
    </Card>
  );
}

"use client";
import { useState } from "react";
import { Card, Table } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatNumber } from "@/lib/format";
import { MutationFeedback, useMutation } from "@/features/operations";
import {
  reportsApi,
  type ReportFilters,
  type ReportReconciliation,
} from "./api";

/** On-demand cross-check of the revenue report against the records it is built from. Heavy, so it never runs by itself. */
export function ReconciliationPanel({ filters }: { filters: ReportFilters }) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const mutation = useMutation();
  const [result, setResult] = useState<ReportReconciliation | null>(null);

  return (
    <Card title={l.reconcileTitle} hint={l.reconcileHint}>
      <button
        type="button"
        className="btn btn--secondary"
        disabled={mutation.busy}
        onClick={async () => {
          setResult(null);
          await mutation.run(async () => {
            setResult(await reportsApi.reconciliation(filters));
          }, "");
        }}
      >
        {mutation.busy ? l.reconcileRunning : l.reconcileRun}
      </button>
      <MutationFeedback mutation={mutation} />
      {result && (
        <div className="stack" aria-live="polite">
          <p role="status">
            <strong>{result.ok ? l.reconcileOk : l.reconcileProblem}</strong>
          </p>
          <p className="small muted">
            {l.reconcileChecked
              .replace("{n}", formatNumber(result.paidInvoicesChecked))
              .replace("{ms}", formatNumber(result.durationMs))}
          </p>
          <Table
            headers={[
              l.reconcileFigure,
              { text: l.reconcileReported, numeric: true },
              { text: l.reconcileActual, numeric: true },
              { text: l.reconcileDelta, numeric: true },
            ]}
          >
            {result.checks.map((check) => (
              <tr key={check.name}>
                <td>{check.name}</td>
                <td className="num">{formatNumber(check.reported)}</td>
                <td className="num">{formatNumber(check.actual)}</td>
                <td className="num">
                  {check.ok ? "—" : formatNumber(check.delta)}
                </td>
              </tr>
            ))}
          </Table>
          {result.invoiceMismatchCount > 0 && (
            <>
              <h3>{l.reconcileInvoices}</h3>
              <Table
                headers={[
                  l.reconcileInvoice,
                  { text: l.reconcileTotal, numeric: true },
                  { text: l.reconcileCash, numeric: true },
                  { text: l.reconcilePoints, numeric: true },
                  { text: l.reconcilePayments, numeric: true },
                ]}
              >
                {result.invoiceMismatches.map((row) => (
                  <tr key={row.invoiceId}>
                    <td>{row.invoiceNumber}</td>
                    <td className="num">{formatMoney(row.totalAmount)}</td>
                    <td className="num">{formatMoney(row.cashAmount)}</td>
                    <td className="num">{formatNumber(row.pointsApplied)}</td>
                    <td className="num">{formatMoney(row.paymentsTotal)}</td>
                  </tr>
                ))}
              </Table>
              {result.invoiceMismatchCount >
                result.invoiceMismatches.length && (
                <p className="small muted">
                  {l.reconcileInvoiceMore
                    .replace("{n}", String(result.invoiceMismatches.length))
                    .replace(
                      "{total}",
                      formatNumber(result.invoiceMismatchCount),
                    )}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

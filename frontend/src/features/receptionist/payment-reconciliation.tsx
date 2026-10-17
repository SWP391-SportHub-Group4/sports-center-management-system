"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Paged } from "@/lib/types";
import styles from "./ops.module.css";

type Case = {
  invoiceId: string; invoiceNumber: string; memberId: string; memberName: string;
  paymentAttemptId: string; verifiedEventId: string | null; amount: number;
  paidAtUtc: string | null; holdExpiresAtUtc: string | null;
  state: string; lastError: string | null;
};

export function FrontDeskPaymentReconciliation() {
  const [page, setPage] = useState(1);
  const cases = useApi((signal) => api.get<Paged<Case>>(
    "/api/front-desk/payment-reconciliation", { signal, query: { page, pageSize: 20 } }), [page]);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function retry(row: Case) {
    setBusy(row.invoiceId);
    setResult(null);
    try {
      const response = await api.post<{ state: string }>(
        `/api/front-desk/payment-reconciliation/${row.invoiceId}/retry`);
      setResult(`${row.invoiceNumber}: ${response.state}. Refresh the invoice to confirm service access.`);
      cases.reload();
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(null);
    }
  }

  return <section className={`card ${styles.panel}`}>
    <h2>Payment and service reconciliation</h2>
    <p className="small muted">Verified payments still awaiting service or compensation appear first. Pending and expired attempts can be checked with the gateway, including after the original hold has expired.</p>
    <button type="button" className="btn btn--secondary btn--sm" onClick={cases.reload}>Refresh</button>
    {cases.loading && <p>Loading…</p>}
    {cases.error && <p role="alert">{cases.error.message}</p>}
    {cases.data?.totalCount === 0 && <p>No cases need follow-up.</p>}
    {cases.data?.items.map(row => <article key={row.paymentAttemptId} className={styles.item}>
      <h3>{row.invoiceNumber} <span className={styles.status}>{row.state.replace(/_/g, " ")}</span></h3>
      <p>{row.memberName} · {formatMoney(row.amount)}</p>
      <p className="small muted">{row.paidAtUtc ? `Paid ${formatDateTime(row.paidAtUtc)}` : "Payment not yet independently verified"}
        {row.holdExpiresAtUtc && ` · Hold expires ${formatDateTime(row.holdExpiresAtUtc)}`}</p>
      {row.lastError && <p role="alert">Last processing error: {row.lastError}</p>}
      <div className={styles.row}>
        <button type="button" className="btn btn--secondary btn--sm" disabled={busy !== null}
          onClick={() => retry(row)}>Verify / retry fulfillment</button>
        <Link className="btn btn--secondary btn--sm" href={`/receptionist/invoices?invoiceId=${row.invoiceId}`}>Invoice</Link>
      </div>
    </article>)}
    {cases.data && <div className={styles.row}>
      <button type="button" className="btn btn--secondary btn--sm" disabled={page <= 1}
        onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page} · {cases.data.totalCount} cases</span>
      <button type="button" className="btn btn--secondary btn--sm"
        disabled={page * 20 >= cases.data.totalCount} onClick={() => setPage(page + 1)}>Next</button>
    </div>}
    {result && <p role="status">{result}</p>}
  </section>;
}

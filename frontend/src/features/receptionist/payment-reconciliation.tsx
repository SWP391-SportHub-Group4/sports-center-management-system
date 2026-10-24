"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Paged } from "@/lib/types";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import styles from "./payment-reconciliation.module.css";

type Line = {
  description: string;
  sportName: string | null;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
};
type Case = {
  invoiceId: string;
  invoiceNumber: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  paymentAttemptId: string;
  verifiedEventId: string | null;
  amount: number;
  paidAtUtc: string | null;
  holdExpiresAtUtc: string | null;
  state: string;
  lastError: string | null;
  issuedAtUtc: string;
  totalAmount: number;
  pointsApplied: number;
  invoiceStatus: string;
  attemptCreatedAtUtc: string;
  items: Line[] | null;
};

const INVOICE_STATUS: Record<string, string> = {
  Issued: "Awaiting payment",
  Void: "Expired / cancelled",
  Paid: "Paid",
  PaidAfterReconciliation: "Paid after reconciliation",
};

/** One plain sentence on what happened and what the desk should do. */
function explain(row: Case) {
  if (row.state === "RECONCILIATION_REQUIRED")
    return `VNPay collected ${formatMoney(row.amount)}${row.paidAtUtc ? ` on ${formatDateTime(row.paidAtUtc)}` : ""}, but the service could not be activated. The member can choose points or submit a PAYMENT support request. A manager handles any bank payout.`;
  if (row.state === "AWAITING_VERIFICATION")
    return `The member opened VNPay on ${formatDateTime(row.attemptCreatedAtUtc)}, but VNPay has not confirmed the payment yet. Verify it with VNPay: if the money was collected, the service is delivered automatically.`;
  if (row.state === "ManualCompensationRequired")
    return `VNPay collected ${formatMoney(row.amount)}${row.paidAtUtc ? ` on ${formatDateTime(row.paidAtUtc)}` : ""}, but the service can no longer be delivered. A manager must compensate the member.`;
  return `VNPay confirmed ${formatMoney(row.amount)}${row.paidAtUtc ? ` on ${formatDateTime(row.paidAtUtc)}` : ""}, but the service was not delivered to the member yet. Retry delivery; if it still fails the payment is returned as points.`;
}

export function FrontDeskPaymentReconciliation() {
  const { values, setValues } = useUrlQuery(
    { view: "paid" },
    { view: choiceQuery(["paid", "all"], "paid") },
  );
  const paidOnly = values.view === "paid";
  const [page, setPage] = useState(1);
  const cases = useApi(
    (signal) =>
      api.get<Paged<Case>>("/api/front-desk/payment-reconciliation", {
        signal,
        query: {
          outcome: paidOnly ? "RECONCILIATION_REQUIRED" : undefined,
          page,
          pageSize: 20,
        },
      }),
    [page, paidOnly],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function retry(row: Case) {
    setBusy(row.invoiceId);
    setResult(null);
    try {
      const response = await api.post<{ state: string }>(
        `/api/front-desk/payment-reconciliation/${row.invoiceId}/retry`,
      );
      setResult(
        `${row.invoiceNumber}: ${response.state.replace(/_/g, " ").toLowerCase()}.`,
      );
      cases.reload();
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <div
        className={styles.actions}
        role="group"
        aria-label="Payment follow-up view"
      >
        <button
          type="button"
          className="btn btn--secondary"
          aria-pressed={paidOnly}
          onClick={() => {
            setValues({ view: "paid" });
            setPage(1);
          }}
        >
          Paid, not activated
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          aria-pressed={!paidOnly}
          onClick={() => {
            setValues({ view: "all" });
            setPage(1);
          }}
        >
          All follow-up cases
        </button>
      </div>
      <p className={styles.intro}>
        {paidOnly
          ? "These VNPay payments were collected but the purchased service was not activated. Help the member review their invoice and support options."
          : "Check pending or expired payments with VNPay and retry service delivery when needed. Completed payments and point compensation remain in invoice history."}
      </p>
      {cases.loading && !cases.data && <p>Loading…</p>}
      {cases.error && <p role="alert">{cases.error.message}</p>}
      {result && (
        <p role="status" className={styles.result}>
          {result}
        </p>
      )}
      {cases.data?.totalCount === 0 && (
        <div className={styles.card}>
          <p className={styles.description}>
            {paidOnly
              ? "No paid payments currently need activation follow-up."
              : "No payment attempts currently need follow-up. If a member says their bank account was charged, open their invoice and ask them to check the payment with VNPay. An empty queue does not confirm whether the bank collected the payment."}
          </p>
          <div className={styles.actions}>
            <Link
              className="btn btn--secondary btn--sm"
              href="/receptionist/invoices"
            >
              Open invoices
            </Link>
          </div>
        </div>
      )}
      {cases.data?.items.map((row) => (
        <article key={row.paymentAttemptId} className={styles.card}>
          <header className={styles.top}>
            <div className={styles.headerInfo}>
              <strong className={styles.number}>{row.invoiceNumber}</strong>
              <span className={styles.date}>
                Issued: {formatDateTime(row.issuedAtUtc)}
              </span>
            </div>
            <span className={styles.state} data-state={row.state}>
              {row.state === "AWAITING_VERIFICATION"
                ? "Awaiting VNPay confirmation"
                : row.state === "RECONCILIATION_REQUIRED"
                  ? "Paid, not activated"
                  : row.state === "ManualCompensationRequired"
                    ? "Needs manager compensation"
                    : "Paid, service not delivered"}
            </span>
          </header>
          <p className={styles.description}>{explain(row)}</p>
          <dl className={styles.infoGrid}>
            <div>
              <dt>Member</dt>
              <dd>{row.memberName}</dd>
            </div>
            <div>
              <dt>Member email</dt>
              <dd>{row.memberEmail}</dd>
            </div>
            <div>
              <dt>Order value</dt>
              <dd>{formatMoney(row.totalAmount)}</dd>
            </div>
            <div>
              <dt>Via VNPay</dt>
              <dd>{formatMoney(row.amount)}</dd>
            </div>
            <div>
              <dt>Points applied</dt>
              <dd>{row.pointsApplied}</dd>
            </div>
            <div>
              <dt>Invoice status</dt>
              <dd>{INVOICE_STATUS[row.invoiceStatus] ?? row.invoiceStatus}</dd>
            </div>
            <div>
              <dt>Payment time</dt>
              <dd>
                {row.paidAtUtc
                  ? formatDateTime(row.paidAtUtc)
                  : "Not confirmed yet"}
              </dd>
            </div>
            <div>
              <dt>Hold expires</dt>
              <dd>
                {row.holdExpiresAtUtc
                  ? formatDateTime(row.holdExpiresAtUtc)
                  : "—"}
              </dd>
            </div>
          </dl>
          {!!row.items?.length && (
            <table className={styles.items}>
              <caption>Purchased services</caption>
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Unit price</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {row.items.map((line, i) => (
                  <tr key={i}>
                    <td>
                      {line.description}
                      {line.sportName && (
                        <span className={styles.sport}>
                          {" "}
                          · {line.sportName}
                        </span>
                      )}
                    </td>
                    <td>{line.quantity}</td>
                    <td>{formatMoney(line.unitPrice)}</td>
                    <td>{formatMoney(line.lineAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {row.lastError && (
            <p role="alert" className={styles.error}>
              Last processing error: {row.lastError}
            </p>
          )}
          {row.state !== "ManualCompensationRequired" &&
            row.state !== "RECONCILIATION_REQUIRED" && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={busy !== null}
                  onClick={() => retry(row)}
                >
                  {busy === row.invoiceId
                    ? "Checking…"
                    : "Verify / retry fulfillment"}
                </button>
              </div>
            )}
          {row.state === "RECONCILIATION_REQUIRED" && (
            <div className={styles.actions}>
              <Link
                className="btn btn--secondary btn--sm"
                href="/receptionist/invoices"
              >
                Open invoices
              </Link>
              <Link
                className="btn btn--secondary btn--sm"
                href="/receptionist/support"
              >
                Open support queue
              </Link>
            </div>
          )}
        </article>
      ))}
      {cases.data && cases.data.totalCount > 0 && (
        <div className={styles.pager}>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} · {cases.data.totalCount} cases
          </span>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={page * 20 >= cases.data.totalCount}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

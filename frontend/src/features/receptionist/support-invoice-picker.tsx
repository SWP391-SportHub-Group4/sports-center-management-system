"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatMoney } from "@/lib/format";
import type {
  InvoiceSummaryDto,
  Paged,
  SupportRefundBreakdownDto,
} from "@/lib/types";
import styles from "./support-center.module.css";

export function SupportInvoicePicker({
  memberId,
  onChange,
}: {
  memberId: string;
  onChange: (
    selection: { invoiceId: string; invoiceItemId: string } | null,
  ) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [itemId, setItemId] = useState("");
  const invoices = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/invoices", {
        signal,
        query: { memberId, keyword, page: 1, pageSize: 20 },
      }),
    [memberId, keyword],
  );
  const breakdown = useApi(
    (signal) =>
      invoiceId
        ? api.get<SupportRefundBreakdownDto>(
            `/api/invoices/${invoiceId}/refund-breakdown`,
            { signal },
          )
        : Promise.resolve(null),
    [invoiceId],
  );
  return (
    <div className="stack">
      <label className={styles.field}>
        Find invoice
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="Invoice number or service"
        />
      </label>
      <label className={styles.field}>
        Invoice
        <select
          value={invoiceId}
          disabled={invoices.loading}
          onChange={(event) => {
            setInvoiceId(event.target.value);
            setItemId("");
            onChange(null);
          }}
        >
          <option value="">Choose the member’s invoice</option>
          {(invoices.data?.items ?? []).map((invoice) => (
            <option key={invoice.invoiceId} value={invoice.invoiceId}>
              {invoice.invoiceNumber} · {formatMoney(invoice.totalAmount)}
            </option>
          ))}
        </select>
      </label>
      {(invoices.loading || breakdown.loading) && (
        <p role="status">Loading invoice services…</p>
      )}
      {invoices.error && (
        <p role="alert">
          {invoices.error.message}{" "}
          <button type="button" onClick={invoices.reload}>
            Retry invoices
          </button>
        </p>
      )}
      {breakdown.error && (
        <p role="alert">
          {breakdown.error.message}{" "}
          <button type="button" onClick={breakdown.reload}>
            Retry services
          </button>
        </p>
      )}
      {!!breakdown.data?.items.length && (
        <label className={styles.field}>
          Service requiring support
          <select
            value={itemId}
            onChange={(event) => {
              setItemId(event.target.value);
              onChange(
                event.target.value
                  ? { invoiceId, invoiceItemId: event.target.value }
                  : null,
              );
            }}
          >
            <option value="">Choose a service</option>
            {breakdown.data.items.map((item) => (
              <option key={item.invoiceItemId} value={item.invoiceItemId}>
                {item.description} · {formatMoney(item.totalVnd)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

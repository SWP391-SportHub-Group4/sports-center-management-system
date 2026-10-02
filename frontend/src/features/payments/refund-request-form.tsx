"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi, useAction } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatPoints } from "@/lib/format";
import type { InvoiceItemDto } from "@/lib/types";
export function RefundRequestForm({
  items,
  onChange,
}: {
  items: InvoiceItemDto[];
  onChange: () => void;
}) {
  const { t } = useLanguage();
  const l = t.refactor;
  const [item, setItem] = useState("");
  const [reason, setReason] = useState("");
  const action = useAction();
  const quote = useApi(
    (signal) =>
      item
        ? api.get<{ systemCalculatedPoints: number }>(
            `/api/refunds/quote/${item}`,
            { signal },
          )
        : Promise.resolve(null),
    [item],
  );
  return (
    <section aria-label={l.refund}>
      <label>
        {l.refund}
        <select
          value={item}
          onChange={(e) => {
            setItem(e.target.value);
            action.reset();
          }}
        >
          <option value="">—</option>
          {items.map((i) => (
            <option key={i.itemId} value={i.itemId}>
              {i.description}
            </option>
          ))}
        </select>
      </label>
      {quote.loading && item ? (
        <p>{l.loading}</p>
      ) : quote.error ? (
        <p role="alert">{quote.error.message}</p>
      ) : (
        quote.data && (
          <p>
            {formatPoints(quote.data.systemCalculatedPoints)} {l.points}
          </p>
        )
      )}
      <label>
        {l.reason}
        <textarea
          minLength={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {action.error && <p role="alert">{action.error}</p>}
      {action.success && <p role="status">{action.success}</p>}
      <button
        className="btn btn--secondary"
        disabled={
          action.busy ||
          !quote.data ||
          quote.data.systemCalculatedPoints <= 0 ||
          reason.trim().length < 3
        }
        onClick={() =>
          action.run(async () => {
            await api.post("/api/refunds", {
              invoiceItemId: item,
              reason: reason.trim(),
            });
            onChange();
            quote.reload();
          }, l.send)
        }
      >
        {l.refund}
      </button>
    </section>
  );
}

"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney } from "@/lib/format";
import type { InvoiceSummaryDto, InvoiceDetailDto, Paged } from "@/lib/types";
import { Card, StatusChip } from "@/components/ui";
import { InvoiceDetail } from "./invoice-detail";
export function InvoiceList({ staff = false }: { staff?: boolean }) {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [linkError, setLinkError] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    const item = new URLSearchParams(window.location.search).get(
      "invoiceItemId",
    );
    const controller = new AbortController();
    if (item && /^[0-9a-f-]{36}$/i.test(item))
      api
        .get<InvoiceDetailDto>(`/api/invoices/by-item/${item}`, {
          signal: controller.signal,
        })
        .then((d) => {
          if (!controller.signal.aborted) setSelected(d.summary.invoiceId);
        })
        .catch((error) => {
          if (!controller.signal.aborted) setLinkError(error.message);
        });
    const id = new URLSearchParams(window.location.search).get("invoiceId");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) setTimeout(() => setSelected(id), 0);
    return () => controller.abort();
  }, []);
  const state = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>(
        staff ? "/api/invoices" : "/api/members/me/invoices",
        { signal, query: { page, pageSize: 10, status } },
      ),
    [staff, page, status],
  );
  return (
    <>
      {linkError && <p role="alert">{linkError}</p>}
      <label>
        {t.refactor.status}
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">—</option>
          {["ISSUED", "PAID", "VOID", "PAID_AFTER_RECONCILIATION"].map((s) => (
            <option key={s} value={s}>
              {t.wireStatus[s as keyof typeof t.wireStatus]}
            </option>
          ))}
        </select>
      </label>
      {state.loading ? (
        <p>{t.refactor.loading}</p>
      ) : state.error ? (
        <p role="alert">{state.error.message}</p>
      ) : !state.data?.items.length ? (
        <p>{t.refactor.empty}</p>
      ) : (
        state.data.items.map((i) => (
          <Card key={i.invoiceId} title={i.invoiceNumber}>
            <p>
              <StatusChip value={i.status} /> · {formatMoney(i.totalAmount)} ·{" "}
              {formatMoney(i.outstanding)}
            </p>
            <button onClick={() => setSelected(i.invoiceId)}>
              {t.refactor.details}
            </button>
          </Card>
        ))
      )}
      <button
        className="btn btn--secondary"
        disabled={page === 1}
        onClick={() => setPage(page - 1)}
      >
        {t.refactor.previous}
      </button>
      <button
        className="btn btn--secondary"
        disabled={!state.data || page * 10 >= state.data.totalCount}
        onClick={() => setPage(page + 1)}
      >
        {t.refactor.more}
      </button>
      {selected && (
        <InvoiceDetail key={selected} invoiceId={selected} staff={staff} />
      )}
    </>
  );
}

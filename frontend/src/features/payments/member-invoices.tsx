"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney } from "@/lib/format";
import { pagedItems } from "@/lib/paged";
import type { InvoiceDetailDto, InvoiceSummaryDto, Paged } from "@/lib/types";
import { AsyncSection, Field, Pager, StatusChip, Table } from "@/components/ui";
import { Select, buttonClass } from "@/components/primitives";

const STATUSES = ["ISSUED", "PAID", "VOID", "PAID_AFTER_RECONCILIATION"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 10;

/**
 * Danh sách hóa đơn của chính Member (A13). Mỗi dòng dẫn tới /member/invoices/[id]; link cũ
 * `?invoiceItemId=` (từ "Khóa học của tôi") được tra rồi chuyển thẳng tới hóa đơn chứa item đó.
 */
export function MemberInvoices() {
  const { t } = useLanguage();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    const item = new URLSearchParams(window.location.search).get(
      "invoiceItemId",
    );
    if (!item || !UUID.test(item)) return;
    const controller = new AbortController();
    api
      .get<InvoiceDetailDto>(`/api/invoices/by-item/${item}`, {
        signal: controller.signal,
      })
      .then((d) => {
        if (!controller.signal.aborted)
          router.replace(
            `/member/finance?tab=invoices&invoice=${d.summary.invoiceId}`,
          );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLinkError(error.message);
      });
    return () => controller.abort();
  }, [router]);

  const state = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/members/me/invoices", {
        signal,
        query: { page, pageSize: PAGE_SIZE, status },
      }),
    [page, status],
  );

  return (
    <>
      {linkError && <p role="alert">{linkError}</p>}
      <Field label={t.refactor.status}>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          placeholder="—"
          options={STATUSES.map((s) => ({
            value: s,
            label: t.wireStatus[s as keyof typeof t.wireStatus],
          }))}
        />
      </Field>
      <AsyncSection
        state={state}
        isEmpty={(data) => !pagedItems(data).length}
        emptyMessage={t.refactor.empty}
      >
        {(data) => (
          <>
            <Table
              headers={[
                t.refactor.invoice,
                t.finance.issuedAt,
                t.refactor.status,
                { text: t.refactor.total, numeric: true },
                { text: t.finance.outstanding, numeric: true },
                "",
              ]}
            >
              {pagedItems(data).map((invoice) => (
                <tr key={invoice.invoiceId}>
                  <td>{invoice.invoiceNumber}</td>
                  <td>{formatDateTime(invoice.issuedAt)}</td>
                  <td>
                    <StatusChip value={invoice.status} />
                  </td>
                  <td className="num">{formatMoney(invoice.totalAmount)}</td>
                  <td className="num">{formatMoney(invoice.outstanding)}</td>
                  <td>
                    <Link
                      className={buttonClass({
                        variant: "secondary",
                        size: "sm",
                      })}
                      href={`/member/finance?tab=invoices&invoice=${invoice.invoiceId}`}
                    >
                      {t.refactor.details}
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
            <Pager
              page={data.page}
              pageSize={data.pageSize}
              totalCount={data.totalCount}
              onChange={setPage}
            />
          </>
        )}
      </AsyncSection>
    </>
  );
}

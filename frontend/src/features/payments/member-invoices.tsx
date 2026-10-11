"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ReceiptText } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { pagedItems } from "@/lib/paged";
import type { InvoiceDetailDto, InvoiceSummaryDto, Paged } from "@/lib/types";
import { AsyncSection, PageNav, StatusChip } from "@/components/ui";
import { EmptyPanel } from "@/components/EmptyPanel";
import { buttonClass } from "@/components/primitives";
import styles from "./member-finance.module.css";

const STATUSES = ["ISSUED", "PAID", "VOID", "PAID_AFTER_RECONCILIATION"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 10;

/**
 * Danh sách hóa đơn của chính Member (A13). Mỗi dòng dẫn tới chi tiết hóa đơn; link cũ
 * `?invoiceItemId=` (từ "Khóa học của tôi") được tra rồi chuyển thẳng tới hóa đơn chứa item đó.
 */
export function MemberInvoices() {
  const { t } = useLanguage();
  const l = t.finance;
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
    <section className={styles.panel} aria-label={l.tabInvoices}>
      {linkError && <p role="alert">{linkError}</p>}
      <header className={styles.head}>
        <p className={styles.count}>
          {state.data
            ? l.invoiceCount.replace("{n}", String(state.data.totalCount))
            : ""}
        </p>
        <select
          aria-label={t.refactor.status}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{l.allStatuses}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.wireStatus[s as keyof typeof t.wireStatus]}
            </option>
          ))}
        </select>
      </header>
      <AsyncSection
        state={state}
        isEmpty={(data) => !pagedItems(data).length}
        emptyMessage={
          status ? (
            <EmptyPanel
              icon={<ReceiptText size={22} />}
              title={l.invoiceFilterEmpty}
              action={
                <button type="button" onClick={() => setStatus("")}>
                  {l.clearFilter}
                </button>
              }
            />
          ) : (
            <EmptyPanel
              icon={<ReceiptText size={22} />}
              title={l.invoiceEmptyTitle}
              body={l.invoiceEmptyBody}
              action={
                <Link href="/member/services?section=courts">
                  {l.invoiceEmptyAction}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              }
            />
          )
        }
      >
        {(data) => (
          <>
            <ul className={styles.invoices}>
              {[...pagedItems(data)]
                .sort(
                  (a, b) =>
                    Number(b.status === "ISSUED") -
                    Number(a.status === "ISSUED"),
                )
                .map((invoice) => {
                  const open =
                    invoice.status === "ISSUED" && invoice.outstanding > 0;
                  const hold =
                    open &&
                    invoice.checkoutExpiresAtUtc &&
                    new Date(invoice.checkoutExpiresAtUtc).getTime() >
                      Date.now();
                  return (
                    <li key={invoice.invoiceId} data-status={invoice.status}>
                      <div className={styles.invoiceMain}>
                        <Link
                          className={styles.invoiceLink}
                          href={`/member/finance?tab=invoices&invoice=${invoice.invoiceId}`}
                        >
                          {invoice.invoiceNumber}
                        </Link>
                        <time dateTime={invoice.issuedAt}>
                          {formatDateTime(invoice.issuedAt)}
                        </time>
                        {hold && (
                          <small className={styles.hold}>
                            {t.memberDashboardV2.heldUntil.replace(
                              "{time}",
                              formatTime(invoice.checkoutExpiresAtUtc),
                            )}
                          </small>
                        )}
                      </div>
                      <StatusChip value={invoice.status} />
                      <div className={styles.invoiceMoney}>
                        <strong>{formatMoney(invoice.totalAmount)}</strong>
                        {open && (
                          <small>
                            {l.invoiceOwed.replace(
                              "{amount}",
                              formatMoney(invoice.outstanding),
                            )}
                          </small>
                        )}
                      </div>
                      {open ? (
                        <Link
                          className={`${buttonClass({ size: "sm" })} ${styles.payAction}`}
                          href={`/member/finance?tab=invoices&invoice=${invoice.invoiceId}`}
                        >
                          {t.memberDashboardV2.payNow}
                        </Link>
                      ) : (
                        <ArrowRight
                          className={styles.chevron}
                          size={18}
                          aria-hidden="true"
                        />
                      )}
                    </li>
                  );
                })}
            </ul>
            <PageNav
              page={data.page}
              totalPages={Math.ceil(data.totalCount / data.pageSize)}
              onChange={setPage}
            />
          </>
        )}
      </AsyncSection>
    </section>
  );
}

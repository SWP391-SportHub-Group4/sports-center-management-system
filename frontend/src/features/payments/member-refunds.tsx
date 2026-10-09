"use client";

import Link from "next/link";
import { useState } from "react";
import { AsyncSection, Pager, StatusChip } from "@/components/ui";
import { buttonClass } from "@/components/primitives";
import { api } from "@/lib/apiClient";
import { formatDateTime, formatPoints } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { pagedItems } from "@/lib/paged";
import type { Paged, PaymentAdjustmentDto } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import styles from "./member-refunds.module.css";

const PAGE_SIZE = 10;

export function MemberRefunds() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const state = useApi(
    (signal) =>
      api.get<Paged<PaymentAdjustmentDto>>("/api/refunds/mine", {
        signal,
        query: { page, pageSize: PAGE_SIZE },
      }),
    [page],
  );

  return (
    <section className={styles.refunds} aria-label={t.finance.tabRefunds}>
      <p>{t.finance.refundRule}</p>
      <AsyncSection state={state}>
        {(data) => (
          <>
            {pagedItems(data).length ? (
              <ul className={styles.list}>
                {pagedItems(data).map((refund) => (
                  <li key={refund.adjustmentId} className={styles.item}>
                    <div className={styles.heading}>
                      <strong>{refund.invoiceNumber}</strong>
                      <StatusChip value={refund.status} />
                    </div>
                    <p>{refund.reason}</p>
                    <p className={styles.meta}>
                      {formatDateTime(refund.createdAt)} ·{" "}
                      {refund.status === "COMPLETED"
                        ? `${t.finance.refundPoints}: ${formatPoints(refund.approvedPoints ?? 0)}`
                        : refund.status === "REQUESTED"
                          ? `${t.finance.refundEstimate}: ${formatPoints(refund.systemCalculatedPoints)}`
                          : t.finance.refundNoCredit}
                    </p>
                    <Link href={`/member/invoices/${refund.invoiceId}`}>
                      {t.finance.refundInvoice}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t.finance.noRefunds}</p>
            )}
            <Pager
              page={data.page}
              pageSize={data.pageSize}
              totalCount={data.totalCount}
              onChange={setPage}
            />
          </>
        )}
      </AsyncSection>
      <Link
        href="/member/finance?tab=invoices"
        className={buttonClass({ variant: "secondary" })}
      >
        {t.finance.requestRefund}
      </Link>
    </section>
  );
}

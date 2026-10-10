"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { AsyncSection, PageNav, StatusChip } from "@/components/ui";
import { EmptyPanel } from "@/components/EmptyPanel";
import { api } from "@/lib/apiClient";
import { formatDateTime, formatPoints } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { pagedItems } from "@/lib/paged";
import type { Paged, PaymentAdjustmentDto } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import styles from "./member-finance.module.css";

const PAGE_SIZE = 10;

export function MemberRefunds() {
  const { t } = useLanguage();
  const l = t.finance;
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
    <section className={styles.panel} aria-label={l.tabRefunds}>
      <header className={styles.head}>
        <p className={styles.caption}>{l.refundFlow}</p>
        {state.data && pagedItems(state.data).length > 0 && (
          <Link
            href="/member/finance?tab=invoices"
            className={styles.quietAction}
          >
            {l.refundEmptyAction}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </header>
      <AsyncSection
        state={state}
        isEmpty={(data) => !pagedItems(data).length}
        emptyMessage={
          <EmptyPanel
            icon={<RotateCcw size={22} />}
            title={l.refundEmptyTitle}
            body={l.refundEmptyBody}
            action={
              <Link href="/member/finance?tab=invoices">
                {l.refundEmptyAction}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            }
          />
        }
      >
        {(data) => (
          <>
            <ol className={styles.timeline}>
              {pagedItems(data).map((refund) => (
                <li key={refund.adjustmentId} data-status={refund.status}>
                  <div className={styles.timelineHead}>
                    <strong>{refund.invoiceNumber}</strong>
                    <StatusChip value={refund.status} />
                  </div>
                  <p className={styles.reason}>{refund.reason}</p>
                  <p className={styles.timelineMeta}>
                    <time dateTime={refund.createdAt}>
                      {formatDateTime(refund.createdAt)}
                    </time>
                    <span>
                      {refund.status === "COMPLETED"
                        ? `${l.refundPoints}: ${formatPoints(refund.approvedPoints ?? 0)}`
                        : refund.status === "REQUESTED"
                          ? `${l.refundEstimate}: ${formatPoints(refund.systemCalculatedPoints)}`
                          : l.refundNoCredit}
                    </span>
                  </p>
                  <Link
                    className={styles.quietAction}
                    href={`/member/finance?tab=invoices&invoice=${refund.invoiceId}`}
                  >
                    {l.refundInvoice}
                  </Link>
                </li>
              ))}
            </ol>
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

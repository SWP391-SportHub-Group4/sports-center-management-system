"use client";

import { Tabs } from "@/components/primitives";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { InvoiceList, ManagerRefunds } from "@/features/payments";
import styles from "./finance.module.css";

const TABS = ["invoices", "refunds"] as const;

/** Tài chính của Manager: hóa đơn (đối soát server, không đánh dấu Paid thủ công) và hàng đợi hoàn điểm. */
export function ManagerFinance() {
  const { t } = useLanguage();
  const f = t.finOps;
  const { values, setValues } = useUrlQuery(
    { tab: "invoices" },
    { tab: choiceQuery([...TABS], "invoices") },
  );
  const tab = values.tab as (typeof TABS)[number];
  return (
    <div className={styles.page}>
      <Tabs
        tabs={[
          { id: "invoices", label: f.tabInvoices },
          { id: "refunds", label: f.tabRefunds },
        ]}
        value={tab}
        ariaLabel={f.tabsLabel}
        onChange={(id) => setValues({ tab: id })}
      >
        <div className={styles.tabBody}>
          {tab === "refunds" ? (
            <ManagerRefunds />
          ) : (
            <InvoiceList staff detailsInDialog />
          )}
        </div>
      </Tabs>
    </div>
  );
}

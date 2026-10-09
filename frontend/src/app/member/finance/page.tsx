"use client";
import { MemberShell } from "@/components/MemberShell";
import { Tabs } from "@/components/primitives";
import { AsyncSection } from "@/components/ui";
import { MemberInvoices, MemberInvoiceDetail } from "@/features/payments";
import { MemberRefunds } from "@/features/payments/member-refunds";
import { walletApi } from "@/features/wallet/api";
import { WalletBalance } from "@/features/wallet/wallet-balance";
import { WalletLedger } from "@/features/wallet/wallet-ledger";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { useApi } from "@/lib/useApi";

const TABS = ["wallet", "invoices", "refunds"] as const;

function WalletTab() {
  const { t } = useLanguage();
  const balance = useApi((signal) => walletApi.balance(signal), []);
  return (
    <>
      <p className="muted">{t.wallet.rule}</p>
      <AsyncSection state={balance}>
        {(data) => <WalletBalance balance={data} />}
      </AsyncSection>
      <WalletLedger />
    </>
  );
}

/** Tài chính của Member (A12 + A13): `?tab=wallet|invoices`, giữ được bằng URL và nút Back. */
export default function Page() {
  const { t } = useLanguage();
  const { values, setValues } = useUrlQuery(
    { tab: "wallet", invoice: "" },
    { tab: choiceQuery(TABS, "wallet") },
  );
  return (
    <MemberShell title={t.finance.title} description={t.finance.description}>
      <Tabs
        ariaLabel={t.finance.tabs}
        value={values.tab}
        onChange={(tab) => setValues({ tab, invoice: "" })}
        tabs={[
          { id: "wallet", label: t.finance.tabWallet },
          { id: "invoices", label: t.finance.tabInvoices },
          { id: "refunds", label: t.finance.tabRefunds },
        ]}
      >
        {values.tab === "invoices" ? (
          values.invoice ? (
            <MemberInvoiceDetail
              key={values.invoice}
              invoiceId={values.invoice}
            />
          ) : (
            <MemberInvoices />
          )
        ) : values.tab === "refunds" ? (
          <MemberRefunds />
        ) : (
          <WalletTab />
        )}
      </Tabs>
    </MemberShell>
  );
}

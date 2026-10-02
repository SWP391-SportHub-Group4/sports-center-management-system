"use client";
import { MemberShell } from "@/components/MemberShell";
import { AsyncSection } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { walletApi } from "@/features/wallet/api";
import { WalletBalance } from "@/features/wallet/wallet-balance";
import { WalletLedger } from "@/features/wallet/wallet-ledger";
export default function WalletPage() {
  const { t } = useLanguage();
  const balance = useApi((signal) => walletApi.balance(signal), []);
  return (
    <MemberShell title={t.wallet.title} description={t.wallet.rule}>
      <AsyncSection state={balance}>
        {(data) => <WalletBalance balance={data} />}
      </AsyncSection>
      <WalletLedger />
    </MemberShell>
  );
}

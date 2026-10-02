"use client";
import { useLanguage } from "@/lib/language";
import type { WalletBalanceDto } from "@/lib/types";
import { formatPoints } from "@/lib/format";
export function WalletBalance({ balance }: { balance: WalletBalanceDto }) {
  const { t } = useLanguage();
  return (
    <dl>
      <dt>{t.wallet.available}</dt>
      <dd>{formatPoints(balance.availablePoints)}</dd>
      <dt>{t.wallet.held}</dt>
      <dd>{formatPoints(balance.heldPoints)}</dd>
    </dl>
  );
}

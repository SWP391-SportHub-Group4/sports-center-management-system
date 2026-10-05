"use client";
import { useLanguage } from "@/lib/language";
import type { WalletBalanceDto } from "@/lib/types";
import { formatMoney, formatPoints } from "@/lib/format";
import styles from "./wallet-balance.module.css";
export function WalletBalance({
  balance,
  compact = false,
}: {
  balance: WalletBalanceDto;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <dl className={`${styles.balance} ${compact ? styles.compact : ""}`}>
      <div>
        <dt>{t.wallet.available}</dt>
        <dd>
          <span className={styles.value}>
            {formatPoints(balance.availablePoints)}
          </span>
          <span className={styles.hint}>
            {t.finance.walletValue}:{" "}
            {formatMoney(balance.availablePoints * balance.vndPerPoint)}
            {!compact && <> · {t.wallet.availableHint}</>}
          </span>
        </dd>
      </div>
      <div>
        <dt>{t.wallet.held}</dt>
        <dd>
          <span className={styles.value}>
            {formatPoints(balance.heldPoints)}
          </span>
          {!compact && <span className={styles.hint}>{t.wallet.heldHint}</span>}
        </dd>
      </div>
    </dl>
  );
}

"use client";
import { useLanguage } from "@/lib/language";
import { formatPoints } from "@/lib/format";
import type { WalletBalanceDto } from "@/lib/types";
export function PointsSelector({
  value,
  onChange,
  wallet,
  totalAmount,
  pointsApplied,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  wallet: WalletBalanceDto | null;
  totalAmount: number;
  pointsApplied: number;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const max = wallet
    ? Math.min(
        wallet.availablePoints + pointsApplied,
        Math.floor(totalAmount / 1000),
      )
    : 0;
  return (
    <>
      <label>
        {t.refactor.points}
        <input
          type="number"
          min="0"
          max={max}
          step="1"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {wallet && (
        <p>
          {formatPoints(wallet.availablePoints)} {t.refactor.points} ·{" "}
          {t.refactor.held}: {formatPoints(wallet.heldPoints)}
        </p>
      )}
      <button
        className="btn btn--secondary"
        disabled={disabled || !wallet}
        onClick={() => onChange(String(max))}
      >
        {t.refactor.maxPoints}: {formatPoints(max)}
      </button>
    </>
  );
}

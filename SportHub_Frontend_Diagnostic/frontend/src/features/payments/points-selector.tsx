"use client";
import { Field } from "@/components/ui";
import { Button, Input } from "@/components/primitives";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatPoints } from "@/lib/format";
import type { WalletBalanceDto } from "@/lib/types";
import styles from "./checkout-panel.module.css";

/**
 * Chọn số điểm dùng cho đơn. Ô nhập chỉ nhận số nguyên; "Dùng tối đa" và "Không dùng điểm" là hai
 * lối tắt, không ép dùng hết ví. Số tiền hiển thị bên dưới chỉ là ƯỚC TÍNH theo vndPerPoint của
 * ví — con số chính thức là phần server trả lại sau khi áp dụng.
 */
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
  const { t, language } = useLanguage();
  const rate = wallet?.vndPerPoint || 1000;
  const max = wallet
    ? Math.min(
        wallet.availablePoints + pointsApplied,
        Math.floor(totalAmount / rate),
      )
    : 0;
  const noPoints = !!wallet && max === 0;
  const typed = /^\d+$/.test(value) ? Number(value) : 0;
  const vi = language === "vi";
  const remaining = Math.max(0, totalAmount - typed * rate);
  return (
    <div className={styles.pointsBox}>
      {wallet && (
        <dl className={styles.balance}>
          <div>
            <dt>{t.checkout.pointsBalance}</dt>
            <dd>
              <strong>{formatPoints(wallet.availablePoints)}</strong>
              <small>≈ {formatMoney(wallet.availablePoints * rate)}</small>
            </dd>
          </div>
          <div>
            <dt>{t.checkout.pointsHeld}</dt>
            <dd>
              <strong>{formatPoints(wallet.heldPoints)}</strong>
            </dd>
          </div>
        </dl>
      )}
      {noPoints && <p className={styles.note}>{t.checkout.pointsNone}</p>}
      <div className={styles.pointsRow}>
        <div className={styles.pointsField}>
          <Field label={vi ? "Số điểm muốn dùng" : t.refactor.points}>
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              max={max}
              step="1"
              value={value}
              disabled={disabled || noPoints}
              onChange={(e) => onChange(e.target.value)}
            />
          </Field>
        </div>
        <div className={styles.pointsQuick}>
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled || !wallet || noPoints}
            onClick={() => onChange(String(max))}
          >
            {t.refactor.maxPoints}: {formatPoints(max)}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || !wallet || noPoints}
            onClick={() => onChange("0")}
          >
            {t.checkout.noPoints}
          </Button>
        </div>
      </div>
      <p className={styles.pointsHint}>{t.checkout.pointsHint}</p>
      {typed > 0 && (
        <p className={styles.worth}>
          {formatPoints(typed)} {t.refactor.points.toLowerCase()}{" "}
          {t.checkout.pointsWorth} {formatMoney(typed * rate)}
          {" · "}
          {vi ? "Còn phải trả" : "Remaining"}{" "}
          <strong>{formatMoney(remaining)}</strong>
        </p>
      )}
    </div>
  );
}

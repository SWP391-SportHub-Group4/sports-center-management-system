"use client";
import { useLanguage } from "@/lib/language";
import { remainingSeconds } from "./checkout.contract";
import styles from "./checkout-panel.module.css";

/**
 * Đồng hồ giữ chỗ. `serverNow` là mốc "bây giờ" theo đồng hồ SERVER (đã hiệu chỉnh offset) — cùng
 * một nguồn với phần quyết định `expired` của panel, nên timer ở summary và ở bước thanh toán không
 * bao giờ lệch nhau và không reset khi reload.
 */
export function HoldCountdown({
  expiresAtUtc,
  serverNow,
  showSource = false,
}: {
  expiresAtUtc: string;
  serverNow: number;
  showSource?: boolean;
}) {
  const { t } = useLanguage();
  const remaining = remainingSeconds(
    expiresAtUtc,
    new Date(serverNow).toISOString(),
  );
  const ended = remaining === 0;
  const low = !ended && remaining < 60;
  const text = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  return (
    <div
      className={`${styles.timer} ${low ? styles.timerLow : ""} ${ended ? styles.timerEnded : ""}`}
    >
      <span className={styles.timerLabel}>{t.checkout.timerLabel}</span>
      <time className={styles.timerValue} dateTime={expiresAtUtc}>
        {text}
      </time>
      {(low || ended) && (
        <p className={styles.timerNote} role="status">
          {ended ? t.checkout.timerExpired : t.checkout.timerLow}
        </p>
      )}
      {showSource && (
        <p className={styles.timerNote}>{t.checkout.timerSource}</p>
      )}
    </div>
  );
}

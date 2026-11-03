"use client";
import { useLanguage } from "@/lib/language";
import { derivePhase, type CheckoutPhase } from "./checkout.contract";
import type { CheckoutDto } from "@/lib/types";
import styles from "./checkout-panel.module.css";

const TONE: Record<CheckoutPhase, string> = {
  RECONCILIATION_REQUIRED: styles.bannerWarning,
  COMPENSATED: styles.bannerWarning,
  FULFILLED: styles.bannerSuccess,
  PAID_PENDING_FULFILLMENT: "",
  VOID: styles.bannerDanger,
  AWAITING_PAYMENT: "",
};

/**
 * Banner trạng thái dựng từ invoiceStatus + fulfillmentOutcome đọc lại từ server.
 * "Đã hoàn tiền vì thanh toán muộn" (COMPENSATED) luôn tách khỏi "thành công" (FULFILLED).
 */
export function InvoiceStatus({ checkout }: { checkout: CheckoutDto }) {
  const { t } = useLanguage();
  const l = t.refactor;
  const phase = derivePhase(checkout);
  const [title, detail]: [string, string?] = {
    RECONCILIATION_REQUIRED: [l.reconciliation],
    COMPENSATED: [l.compensated],
    FULFILLED: [l.paid, t.checkout.phaseFulfilled],
    PAID_PENDING_FULFILLMENT: [t.checkout.phasePaidPending],
    VOID: [t.checkout.phaseVoid],
    AWAITING_PAYMENT: [l.pending, t.checkout.returnNote],
  }[phase] as [string, string?];
  return (
    <div className={`${styles.banner} ${TONE[phase]}`} role="status">
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}

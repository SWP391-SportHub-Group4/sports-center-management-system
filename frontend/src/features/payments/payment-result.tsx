"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  CircleAlert,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { Button, buttonClass } from "@/components/primitives";
import { formatDateTime, formatMoney, formatPoints } from "@/lib/format";
import type { CheckoutDto, InvoiceDetailDto } from "@/lib/types";
import { derivePhase } from "./checkout.contract";
import { DownloadInvoiceButton } from "./download-invoice-button";
import styles from "./payment-result.module.css";

export function PaymentResult({
  checkout,
  detail,
  checking = false,
  cancelled = false,
  error = "",
  onRefresh,
}: {
  checkout: CheckoutDto;
  detail?: InvoiceDetailDto | null;
  checking?: boolean;
  cancelled?: boolean;
  error?: string;
  onRefresh: () => void;
}) {
  const phase = derivePhase(checkout);
  const paid = ["PAID", "PAID_AFTER_RECONCILIATION"].includes(
    checkout.invoiceStatus,
  );
  const complete = paid && phase === "FULFILLED";
  const compensated = phase === "COMPENSATED";
  const review = phase === "RECONCILIATION_REQUIRED";
  const expired = phase === "VOID";
  const pending =
    !complete && !compensated && !review && !expired && !cancelled;
  const title = complete
    ? "Payment successful"
    : cancelled
      ? "Payment cancelled"
      : compensated
        ? "Payment returned as points"
        : review
          ? "Your payment is under review"
          : expired && !checking
            ? "This checkout has expired"
            : paid
              ? "Payment received"
              : "Confirming your payment";
  const description = cancelled
    ? "You cancelled this payment on VNPay and nothing was charged. Your order is still open, so you can pay again before it expires."
    : complete
      ? checkout.kind === "COURT_RENTAL"
        ? "Your court booking is confirmed. Your next session is waiting in My schedule."
        : checkout.kind === "CLASS"
          ? "You're registered. Your classes and lesson details are ready in My schedule."
          : "Your membership is active. You're ready for your next workout."
      : compensated
        ? "This purchase could not be completed. The payment has been credited to your SportHub points wallet."
        : review
          ? "Our team needs to check this transaction. You can follow its status in your invoice."
          : expired && !checking
            ? "The reservation window has ended. If you completed payment, check again to confirm its final status."
            : paid
              ? "Your payment is confirmed. We're finishing your booking and will update this page automatically."
              : "We're checking the final result with VNPay. This page updates automatically while confirmation is pending.";
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (complete) heading.current?.focus({ preventScroll: true });
  }, [complete]);
  const nextHref =
    checkout.kind === "MEMBERSHIP"
      ? "/member/services?tab=gym"
      : "/member/schedule";
  const nextLabel =
    checkout.kind === "MEMBERSHIP" ? "View membership" : "View my schedule";
  const invoiceHref = `/member/finance?tab=invoices&invoice=${checkout.invoiceId}`;
  const payment = detail?.payments.find(
    (p) => p.status === "SUCCESS" || p.status === "SUCCEEDED",
  );
  const label =
    checkout.kind === "COURT_RENTAL"
      ? "Court booking"
      : checkout.kind === "CLASS"
        ? "Class registration"
        : "Gym membership";

  return (
    <section
      className={styles.result}
      aria-label="Payment result"
      data-payment-state={complete ? "success" : "pending"}
    >
      <div className={styles.message} data-surface="inverse">
        <div
          className={`${styles.symbol} ${!complete ? styles.neutral : ""}`}
          aria-hidden="true"
        >
          {complete ? (
            <Check size={34} strokeWidth={2.5} />
          ) : pending || checking ? (
            <Clock3 size={32} />
          ) : (
            <CircleAlert size={32} />
          )}
        </div>
        <div role="status" aria-live="polite">
          <p className={styles.category}>{label}</p>
          <h2 ref={heading} tabIndex={-1} className={styles.title}>
            {title}
          </h2>
          <p className={styles.description}>{description}</p>
        </div>
        {complete ? (
          <Link
            href={nextHref}
            className={buttonClass({ size: "lg", className: styles.primary })}
          >
            {nextLabel}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        ) : compensated ? (
          <Link
            href="/member/finance?tab=wallet"
            className={buttonClass({ size: "lg", className: styles.primary })}
          >
            View points wallet
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        ) : cancelled ? (
          <Link
            href={`/checkout/${checkout.invoiceId}`}
            className={buttonClass({ size: "lg", className: styles.primary })}
          >
            Pay again
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        ) : (
          <Button
            size="lg"
            className={styles.primary}
            loading={checking}
            loadingLabel="Checking payment"
            onClick={onRefresh}
          >
            {checking ? "Checking payment" : "Check payment again"}
          </Button>
        )}
        <Link href="/member" className={styles.back}>
          <ArrowLeft size={16} aria-hidden="true" />
          Back to dashboard
        </Link>
      </div>
      <div className={styles.receipt}>
        <div className={styles.receiptHeading}>
          <ReceiptText size={20} aria-hidden="true" />
          <h3>Payment summary</h3>
          <span
            className={`${styles.status} ${complete ? styles.confirmed : ""}`}
          >
            {complete
              ? "Confirmed"
              : cancelled
                ? "Cancelled"
                : compensated
                  ? "Credited"
                  : review
                    ? "Under review"
                    : expired
                      ? "Expired"
                      : paid
                        ? "Received"
                        : "Pending"}
          </span>
        </div>
        <p className={styles.invoiceLabel}>Invoice</p>
        <p className={styles.invoiceNumber}>
          {detail?.summary.invoiceNumber ?? checkout.invoiceId}
        </p>
        {detail?.items?.length ? (
          <ul className={styles.items}>
            {detail.items.map((item) => (
              <li key={item.itemId}>
                <span>{item.description}</span>
                <strong>{formatMoney(item.lineAmount)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.purchase}>{label}</p>
        )}
        <dl className={styles.amounts}>
          {checkout.cashAmount > 0 && (
            <div>
              <dt>VNPay payment</dt>
              <dd>{formatMoney(checkout.cashAmount)}</dd>
            </div>
          )}
          {checkout.pointsApplied > 0 && (
            <div>
              <dt>Wallet points</dt>
              <dd>{formatPoints(checkout.pointsApplied)} points</dd>
            </div>
          )}
          {complete && payment?.paidAt && (
            <div>
              <dt>Paid on</dt>
              <dd>{formatDateTime(payment.paidAt)}</dd>
            </div>
          )}
          <div className={styles.total}>
            <dt>{complete ? "Total paid" : "Order total"}</dt>
            <dd>{formatMoney(checkout.totalAmount)}</dd>
          </div>
        </dl>
        <div className={styles.invoiceActions}>
          <Link
            href={invoiceHref}
            className={buttonClass({ variant: "secondary", block: true })}
          >
            View invoice
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          {paid && (
            <DownloadInvoiceButton invoiceId={checkout.invoiceId} block />
          )}
        </div>
        {complete ? (
          <p className={styles.assurance}>
            <ShieldCheck size={16} aria-hidden="true" />
            Payment confirmed by SportHub
          </p>
        ) : cancelled ? null : (
          <p className={styles.caution}>
            If you have completed payment, wait for confirmation before making
            another payment.
          </p>
        )}
        {!complete && error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

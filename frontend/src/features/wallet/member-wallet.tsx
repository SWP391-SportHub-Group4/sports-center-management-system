"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Coins } from "lucide-react";
import { AsyncSection, PageNav } from "@/components/ui";
import { EmptyPanel } from "@/components/EmptyPanel";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney, formatPoints } from "@/lib/format";
import { walletApi } from "./api";
import { paymentApi, openPaymentGateway } from "@/features/payments";
import type { CheckoutDto } from "@/lib/types";
import styles from "./member-wallet.module.css";

const PAGE_SIZE = 20;

/** Ví điểm của Member: một thẻ số dư chính, một cột phụ, sổ điểm là một danh sách liền. */
export function MemberWallet() {
  const { t, language } = useLanguage();
  const l = t.finance;
  const w = t.wallet;
  const [page, setPage] = useState(1);
  const [entryType, setEntryType] = useState("");
  const [topUpPoints, setTopUpPoints] = useState("100");
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [topUpError, setTopUpError] = useState("");
  const [topUpCheckout, setTopUpCheckout] = useState<CheckoutDto | null>(null);
  const topUpKey = useRef<string | null>(null);
  const balance = useApi((signal) => walletApi.balance(signal), []);
  const ledger = useApi(
    (signal) => walletApi.ledger(page, signal, entryType),
    [page, entryType],
  );
  const events: Record<string, string> = {
    HOLD: w.hold,
    RELEASE: w.release,
    SPEND: w.spend,
    EARN: w.earn,
    ADJUSTMENT: w.adjustment,
  };
  const points = Number(topUpPoints);
  const validPoints =
    /^\d+$/.test(topUpPoints) && points >= 1 && points <= 10_000;
  async function createTopUp() {
    if (!validPoints || topUpBusy) return;
    setTopUpBusy(true);
    setTopUpError("");
    try {
      const checkout = await paymentApi.create(
        { kind: "wallet-top-up", body: { points } },
        (topUpKey.current ??= crypto.randomUUID()),
      );
      setTopUpCheckout(checkout);
    } catch (error) {
      setTopUpError(
        error instanceof Error ? error.message : "Unable to prepare top-up.",
      );
    } finally {
      setTopUpBusy(false);
    }
  }
  async function payTopUp() {
    if (!topUpCheckout || topUpBusy) return;
    setTopUpBusy(true);
    setTopUpError("");
    try {
      const attempt = await paymentApi.attempt(topUpCheckout.invoiceId);
      openPaymentGateway(attempt);
    } catch (error) {
      setTopUpError(
        error instanceof Error ? error.message : "Unable to start payment.",
      );
    } finally {
      setTopUpBusy(false);
    }
  }
  return (
    <div className={styles.wallet}>
      <AsyncSection state={balance}>
        {(b) => (
          <section
            className={styles.balance}
            data-split={b.heldPoints > 0}
            aria-label={w.title}
          >
            <div className={styles.primary}>
              <span className={styles.label}>{w.available}</span>
              <strong className={styles.hero}>
                {formatPoints(b.availablePoints)}
              </strong>
              <span className={styles.worth}>
                {formatMoney(b.availablePoints * b.vndPerPoint)} · {l.pointRate}
              </span>
              <span className={styles.note}>{l.pointRateHint}</span>
            </div>
            {b.heldPoints > 0 && (
              <dl className={styles.secondary}>
                <div>
                  <dt>{w.held}</dt>
                  <dd>
                    {formatPoints(b.heldPoints)}
                    <small>{l.heldNote}</small>
                  </dd>
                </div>
                <div>
                  <dt>{w.total}</dt>
                  <dd>
                    {formatPoints(b.availablePoints + b.heldPoints)}
                    <small>{l.totalNote}</small>
                  </dd>
                </div>
              </dl>
            )}
          </section>
        )}
      </AsyncSection>
      <section className={styles.topUp} aria-labelledby="wallet-top-up-title">
        <div>
          <h2 id="wallet-top-up-title">
            {language === "vi" ? "Nạp điểm" : "Add points"}
          </h2>
          <p>
            {language === "vi"
              ? "Chọn số điểm và thanh toán qua VNPay. Điểm được cộng sau khi giao dịch được xác nhận."
              : "Choose points and pay with VNPay. Points are added after payment is confirmed."}
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createTopUp();
          }}
        >
          <label htmlFor="top-up-points">
            {language === "vi" ? "Số điểm" : "Points"}
          </label>
          <input
            id="top-up-points"
            type="number"
            min="1"
            max="10000"
            step="1"
            required
            value={topUpPoints}
            onChange={(event) => {
              setTopUpPoints(event.target.value);
              topUpKey.current = null;
              setTopUpCheckout(null);
            }}
          />
          <span>
            {validPoints
              ? balance.data
                ? `1 ${language === "vi" ? "điểm" : "point"} = ${formatMoney(balance.data.vndPerPoint)}`
                : ""
              : language === "vi"
                ? "Nhập từ 1 đến 10.000 điểm"
                : "Enter 1 to 10,000 points"}
          </span>
          <button
            className="btn"
            type="submit"
            disabled={!validPoints || topUpBusy || !!topUpCheckout}
          >
            {topUpBusy
              ? language === "vi"
                ? "Đang xử lý…"
                : "Processing…"
              : language === "vi"
                ? "Xem số tiền nạp"
                : "Review top-up"}
          </button>
        </form>
        {topUpCheckout && (
          <div className={styles.topUpReview}>
            <p>
              {language === "vi"
                ? "Số tiền VNPay do hệ thống xác nhận"
                : "VNPay amount confirmed by SportHub"}
            </p>
            <strong>{formatMoney(topUpCheckout.cashAmount)}</strong>
            <button
              className="btn"
              type="button"
              disabled={topUpBusy}
              onClick={() => void payTopUp()}
            >
              {topUpBusy
                ? language === "vi"
                  ? "Đang xử lý…"
                  : "Processing…"
                : language === "vi"
                  ? "Thanh toán bằng VNPay"
                  : "Pay with VNPay"}
            </button>
          </div>
        )}
        {topUpError && (
          <p role="alert" className={styles.topUpError}>
            {topUpError}
          </p>
        )}
        {topUpCheckout && (
          <Link href={`/checkout/${topUpCheckout.invoiceId}`}>
            {language === "vi"
              ? "Xem giao dịch nạp điểm"
              : "View top-up checkout"}{" "}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </section>
      <section className={styles.history} aria-labelledby="wallet-history">
        <header className={styles.historyHead}>
          <h2 id="wallet-history">{w.history}</h2>
          {(entryType || !!ledger.data?.length) && (
            <select
              aria-label={w.event}
              value={entryType}
              onChange={(e) => {
                setEntryType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{w.all}</option>
              {Object.entries(events).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </header>
        <AsyncSection
          state={ledger}
          isEmpty={(rows) => !rows.length}
          emptyMessage={
            entryType ? (
              <EmptyPanel
                icon={<Coins size={22} />}
                title={l.ledgerFilterEmpty}
                action={
                  <button type="button" onClick={() => setEntryType("")}>
                    {l.clearFilter}
                  </button>
                }
              />
            ) : (
              <EmptyPanel
                icon={<Coins size={22} />}
                title={l.ledgerEmptyTitle}
                body={l.ledgerEmptyBody}
                action={
                  <Link href="/member/services">
                    {l.ledgerEmptyAction}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                }
              />
            )
          }
        >
          {(rows) => (
            <>
              <ul className={styles.list}>
                {rows.slice(0, PAGE_SIZE).map((row) => {
                  const label =
                    row.entryType === "EARN" &&
                    row.referenceType === "PaymentAdjustment"
                      ? w.refundEarn
                      : (events[row.entryType] ?? row.entryType);
                  const delta = row.availableDelta || row.heldDelta;
                  return (
                    <li key={row.id}>
                      <div className={styles.what}>
                        <strong>{label}</strong>
                        {row.note && (
                          <p>
                            {row.referenceType === "SystemEvent" &&
                            row.entryType === "EARN"
                              ? `${l.refundReason}: `
                              : ""}
                            {row.note}
                          </p>
                        )}
                        {row.sourceDescription && (
                          <p>
                            {l.refundSource}: {row.sourceDescription}
                            {row.sourceInvoiceId && (
                              <>
                                {" · "}
                                <Link
                                  href={`/member/finance?tab=invoices&invoice=${row.sourceInvoiceId}`}
                                >
                                  {l.refundInvoice}
                                </Link>
                              </>
                            )}
                          </p>
                        )}
                        <time dateTime={row.createdAtUtc}>
                          {formatDateTime(row.createdAtUtc)}
                        </time>
                      </div>
                      <div className={styles.amount}>
                        <span
                          className={delta < 0 ? styles.out : styles.in}
                          data-held={row.availableDelta === 0}
                        >
                          {delta > 0 ? "+" : ""}
                          {formatPoints(delta)}
                        </span>
                        <small>
                          {l.balanceAfter.replace(
                            "{n}",
                            formatPoints(row.availableAfter),
                          )}
                        </small>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <PageNav
                page={page}
                hasNext={rows.length >= PAGE_SIZE}
                loading={ledger.loading}
                onChange={setPage}
              />
            </>
          )}
        </AsyncSection>
      </section>
    </div>
  );
}

"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRight, Coins, Plus } from "lucide-react";
import { buttonClass } from "@/components/primitives";
import { AsyncSection, PageNav } from "@/components/ui";
import { EmptyPanel } from "@/components/EmptyPanel";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney, formatPoints } from "@/lib/format";
import { walletApi } from "./api";
import { useWalletRefresh } from "./wallet-events";
import styles from "./member-wallet.module.css";

const PAGE_SIZE = 20;

/** Ví điểm của Member: một thẻ số dư chính, một cột phụ, sổ điểm là một danh sách liền. */
export function MemberWallet() {
  const { t } = useLanguage();
  const l = t.finance;
  const w = t.wallet;
  const [page, setPage] = useState(1);
  const [entryType, setEntryType] = useState("");
  const balance = useApi((signal) => walletApi.balance(signal), []);
  const ledger = useApi(
    (signal) => walletApi.ledger(page, signal, entryType),
    [page, entryType],
  );
  const reloadBalance = balance.reload;
  const reloadLedger = ledger.reload;
  useWalletRefresh(
    useCallback(() => {
      reloadBalance();
      reloadLedger();
    }, [reloadBalance, reloadLedger]),
  );
  const events: Record<string, string> = {
    HOLD: w.hold,
    RELEASE: w.release,
    SPEND: w.spend,
    EARN: w.earn,
    ADJUSTMENT: w.adjustment,
  };
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
              <Link
                href="/member/wallet/top-up"
                className={`${buttonClass({ size: "sm" })} ${styles.addPoints}`}
              >
                <Plus size={16} aria-hidden="true" />
                Add points
              </Link>
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
                  const topUp = row.referenceType === "WalletTopUp";
                  const label = topUp
                    ? "Points top-up via VNPay"
                    : row.entryType === "EARN" &&
                        row.referenceType === "PaymentAdjustment"
                      ? w.refundEarn
                      : (events[row.entryType] ?? row.entryType);
                  const delta = row.availableDelta || row.heldDelta;
                  return (
                    <li key={row.id}>
                      <div className={styles.what}>
                        <strong>{label}</strong>
                        {topUp && (
                          <p>
                            Paid {formatMoney(row.points * 1000)} · +
                            {formatPoints(row.points)} points
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
                        {!topUp && row.note && (
                          <p>
                            {row.referenceType === "SystemEvent" &&
                            row.entryType === "EARN"
                              ? `${l.refundReason}: `
                              : ""}
                            {row.note}
                          </p>
                        )}
                        {!topUp && row.sourceDescription && (
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

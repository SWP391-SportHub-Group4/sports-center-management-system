"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Coins } from "lucide-react";
import { AsyncSection, PageNav } from "@/components/ui";
import { EmptyPanel } from "@/components/EmptyPanel";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney, formatPoints } from "@/lib/format";
import { walletApi } from "./api";
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
  const events: Record<string, string> = {
    HOLD: w.hold,
    RELEASE: w.release,
    SPEND: w.spend,
    EARN: w.earn,
    ADJUSTMENT: w.adjustment,
  };
  const firstUse =
    !!balance.data &&
    !!ledger.data &&
    !entryType &&
    !ledger.data.length &&
    balance.data.availablePoints + balance.data.heldPoints === 0;
  if (firstUse)
    return (
      <div className={styles.wallet}>
        <EmptyPanel
          icon={<Coins size={22} />}
          title={l.ledgerEmptyTitle}
          body={`${l.ledgerEmptyBody} ${l.pointRate}.`}
          action={
            <Link href="/member/services">
              {l.ledgerEmptyAction}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          }
        />
      </div>
    );
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
                  <dd>{formatPoints(b.heldPoints)}</dd>
                  <small>{l.heldNote}</small>
                </div>
                <div>
                  <dt>{w.total}</dt>
                  <dd>{formatPoints(b.availablePoints + b.heldPoints)}</dd>
                  <small>{l.totalNote}</small>
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
                        {row.note && <p>{row.note}</p>}
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

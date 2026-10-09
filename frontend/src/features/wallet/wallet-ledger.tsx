"use client";

import { useState } from "react";
import { walletApi } from "./api";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatPoints } from "@/lib/format";
import { AsyncSection } from "@/components/ui";
import { api } from "@/lib/apiClient";
import type { WalletLedgerDto } from "@/lib/types";
import styles from "./wallet-ledger.module.css";

export function WalletLedger({
  memberId,
  ownerId,
}: {
  memberId?: string;
  ownerId?: string;
}) {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [entryType, setEntryType] = useState("");

  const events: Record<string, string> = {
    HOLD: t.wallet.hold,
    RELEASE: t.wallet.release,
    SPEND: t.wallet.spend,
    EARN: t.wallet.earn,
    ADJUSTMENT: t.wallet.adjustment,
  };

  const state = useApi(
    (signal) =>
      ownerId
        ? api.get<WalletLedgerDto[]>(`/api/manager/wallets/${ownerId}/ledger`, {
            signal,
            query: { page, pageSize: 20, entryType },
          })
        : memberId
          ? api.get<WalletLedgerDto[]>(
              `/api/members/${memberId}/points/ledger`,
              {
                signal,
                query: { page, pageSize: 20, entryType },
              },
            )
          : walletApi.ledger(page, signal, entryType),
    [page, entryType, memberId, ownerId],
  );

  const eventLabel = (row: WalletLedgerDto) =>
    row.entryType === "EARN" && row.referenceType === "PaymentAdjustment"
      ? t.wallet.refundEarn
      : (events[row.entryType] ?? row.entryType);

  return (
    <section>
      <h2>{t.wallet.history}</h2>

      <label>
        {t.wallet.event}
        <select
          value={entryType}
          onChange={(e) => {
            setEntryType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t.wallet.all}</option>
          {Object.entries(events).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <AsyncSection state={state} emptyMessage={t.wallet.empty}>
        {(data) => (
          <>
            {ownerId || memberId ? (
              <div
                className="table-wrap wallet-ledger"
                tabIndex={0}
                role="region"
                aria-label={t.wallet.history}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t.wallet.date}</th>
                      <th scope="col">{t.wallet.event}</th>
                      <th scope="col">{t.wallet.available}</th>
                      <th scope="col">{t.wallet.held}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.slice(0, 20).map((row) => (
                      <tr key={row.id}>
                        <td>{formatDateTime(row.createdAtUtc)}</td>
                        <td>{eventLabel(row)}</td>
                        <td>{formatPoints(row.availableDelta)}</td>
                        <td>{formatPoints(row.heldDelta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul className={styles.list}>
                {data.slice(0, 20).map((row) => (
                  <li key={row.id} className={styles.entry}>
                    <div className={styles.entryTop}>
                      <div>
                        <time dateTime={row.createdAtUtc}>
                          {formatDateTime(row.createdAtUtc)}
                        </time>
                        <strong>{eventLabel(row)}</strong>
                      </div>
                      <span
                        className={
                          row.availableDelta < 0
                            ? styles.outflow
                            : styles.inflow
                        }
                      >
                        {row.availableDelta > 0 ? "+" : ""}
                        {formatPoints(row.availableDelta)}
                      </span>
                    </div>

                    {row.note && <p>{row.note}</p>}

                    {row.availableDelta !== 0 && (
                      <small>
                        {t.wallet.availableTransition
                          .replace(
                            "{before}",
                            formatPoints(
                              row.availableAfter - row.availableDelta,
                            ),
                          )
                          .replace("{after}", formatPoints(row.availableAfter))}
                      </small>
                    )}

                    {row.heldDelta !== 0 && (
                      <small>
                        {t.wallet.heldTransition
                          .replace(
                            "{before}",
                            formatPoints(row.heldAfter - row.heldDelta),
                          )
                          .replace("{after}", formatPoints(row.heldAfter))}
                      </small>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!data.length && <p>{t.wallet.empty}</p>}

            <div className="btn-row">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={page === 1 || state.loading}
                onClick={() => setPage((p) => p - 1)}
              >
                {t.wallet.previous}
              </button>
              <span>{page}</span>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={data.length < 20 || state.loading}
                onClick={() => setPage((p) => p + 1)}
              >
                {t.wallet.next}
              </button>
            </div>
          </>
        )}
      </AsyncSection>
    </section>
  );
}
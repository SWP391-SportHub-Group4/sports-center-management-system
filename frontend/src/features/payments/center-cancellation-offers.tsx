"use client";

import { api } from "@/lib/apiClient";
import { formatDateTime, formatPoints } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import styles from "./member-finance.module.css";

export interface CenterCancellationOfferDto {
  invoiceItemId: string;
  invoiceId: string;
  kind: "Class" | "CourtRental";
  name: string;
  cancelledAtUtc: string;
  reason?: string | null;
  refundPoints: number;
  remainingValueVnd: number;
  autoRefundAtUtc: string;
  status: "Offer" | "PointsCredited" | "RefundRequested";
  creditedPoints: number;
}

const KIND_LABEL: Record<CenterCancellationOfferDto["kind"], string> = {
  Class: "Class",
  CourtRental: "Court rental",
};

/**
 * When the center cancels a class or court rental it only notifies the member. Here the member picks, once per item:
 * receive 100% of the remaining paid value as points (credited automatically), or send a refund request that the
 * Manager handles. With no choice by the deadline the points are credited automatically.
 */
export function CenterCancellationOffers() {
  const state = useApi(
    (signal) =>
      api.get<CenterCancellationOfferDto[]>(
        "/api/refunds/center-cancellations/mine",
        { signal },
      ),
    [],
  );
  const action = useAction();
  const offers = state.data ?? [];
  if (state.loading && !state.data) return null;
  if (state.error) return <p role="alert">{state.error.message}</p>;
  if (!offers.length) return null;

  return (
    <section
      className={styles.panel}
      aria-label="Refunds for cancellations by the center"
    >
      <header className={styles.head}>
        <p className={styles.caption}>
          The center cancelled these items. Choose how to be refunded. Points
          are credited right away; a refund request is handled by the Manager.
          You can pick only one option per item.
        </p>
      </header>
      {action.error && <p role="alert">{action.error}</p>}
      {action.success && <p role="status">{action.success}</p>}
      <ol className={styles.timeline}>
        {offers.map((offer) => (
          <li key={offer.invoiceItemId} data-status={offer.status}>
            <div className={styles.timelineHead}>
              <strong>
                {KIND_LABEL[offer.kind]} · {offer.name}
              </strong>
              <span>
                {offer.status === "PointsCredited"
                  ? "Points credited"
                  : offer.status === "RefundRequested"
                    ? "Refund request sent"
                    : "Choose a refund"}
              </span>
            </div>
            {offer.reason && <p className={styles.reason}>{offer.reason}</p>}
            <p className={styles.timelineMeta}>
              <time dateTime={offer.cancelledAtUtc}>
                {formatDateTime(offer.cancelledAtUtc)}
              </time>
              <span>
                {offer.status === "PointsCredited"
                  ? `Credited: ${formatPoints(offer.creditedPoints)}`
                  : `Refund: ${formatPoints(offer.refundPoints)}`}
              </span>
            </p>
            {offer.status === "Offer" && (
              <>
                <p className="muted">
                  No choice by {formatDateTime(offer.autoRefundAtUtc)}? The
                  points are credited automatically.
                </p>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={action.busy}
                  onClick={() =>
                    void action
                      .run(
                        () =>
                          api.post(
                            `/api/refunds/center-cancellations/${offer.invoiceItemId}/points`,
                          ),
                        "Points credited to your wallet.",
                      )
                      .then(() => state.reload())
                  }
                >
                  Receive {formatPoints(offer.refundPoints)} now
                </button>{" "}
                <a
                  className={styles.quietAction}
                  href={`/member/help?topic=PAYMENT&invoiceId=${offer.invoiceId}&invoiceItemId=${offer.invoiceItemId}`}
                >
                  Request a refund instead
                </a>
              </>
            )}
            {offer.status === "RefundRequested" && (
              <p className="muted">
                The Manager is handling your refund request. Points can no
                longer be chosen for this item.
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

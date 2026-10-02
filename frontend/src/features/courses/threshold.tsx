"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi, useAction, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney, formatPoints } from "@/lib/format";
import type { CourseDto, Paged, ThresholdResponseDto } from "@/lib/types";
import { Card, StatusChip } from "@/components/ui";
import { CheckoutPanel } from "@/features/payments";
export type ThresholdView = ThresholdResponseDto;
export function ThresholdPanel({
  responseId,
  token,
}: {
  responseId?: string;
  token?: string;
}) {
  const { t } = useLanguage();
  const l = t.refactor;
  const now = useNow(1000);
  const [target, setTarget] = useState("");
  const action = useAction();
  const state = useApi(
    (signal) =>
      api.get<ThresholdView>(
        responseId
          ? `/api/class-threshold-responses/${responseId}`
          : "/api/class-threshold-responses/by-token",
        { signal, query: token ? { token } : undefined },
      ),
    [responseId, token],
  );
  const d = state.data;
  const [clockOffset, setClockOffset] = useState(0);
  useEffect(() => {
    if (!d?.serverNowUtc) return;
    const offset = Date.parse(d.serverNowUtc) - Date.now();
    const timer = setTimeout(() => setClockOffset(offset), 0);
    return () => clearTimeout(timer);
  }, [d?.serverNowUtc]);
  const targets = useApi(
    (signal) =>
      d
        ? api.get<Paged<CourseDto>>("/api/classes", {
            signal,
            query: { sportId: d.sportId, pageSize: 100 },
          })
        : Promise.resolve(null),
    [d?.sportId],
  );
  const quote = useApi(
    (signal) =>
      d && target
        ? api.get<{
            cashDifference: number;
            walletCreditPoints: number;
            targetPrice: number;
            sourceValue: number;
          }>(`/api/class-threshold-responses/${d.responseId}/transfer-quote`, {
            signal,
            query: { targetClassId: target },
          })
        : Promise.resolve(null),
    [d?.responseId, target],
  );
  const closed = d
    ? !!d.choice || Date.parse(d.deadlineUtc) <= now + clockOffset
    : false;
  async function respond(choice: "REFUND" | "TRANSFER") {
    if (!d) return;
    await action.run(async () => {
      await api.post(`/api/class-threshold-responses/${d.responseId}`, {
        choice,
        targetClassId: choice === "TRANSFER" ? Number(target) : null,
      });
      state.reload();
    });
  }
  return (
    <Card title={l.threshold}>
      {state.loading ? (
        <p>{l.loading}</p>
      ) : state.error ? (
        <p role="alert">{state.error.message}</p>
      ) : (
        d && (
          <>
            <h3>{d.className}</h3>
            <p>
              {l.deadline}: {formatDateTime(d.deadlineUtc)}
            </p>
            <p>
              {l.status}: <StatusChip value={d.resolutionStatus} /> ·{" "}
              <StatusChip value={d.choice} />
            </p>
            <p>{formatMoney(d.paidValueVnd)}</p>
            {!closed && (
              <>
                <button
                  className="btn btn--secondary"
                  disabled={action.busy}
                  onClick={() => respond("REFUND")}
                >
                  {l.refund}
                </button>
                <label>
                  {l.transfer}
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">—</option>
                    {targets.data?.items
                      .filter(
                        (c) => c.classId !== d.classId && c.availableSeats > 0,
                      )
                      .map((c) => (
                        <option value={c.classId} key={c.classId}>
                          {c.name} · {formatMoney(c.price)}
                        </option>
                      ))}
                  </select>
                </label>
                {targets.error && <p role="alert">{targets.error.message}</p>}
                {quote.error && <p role="alert">{quote.error.message}</p>}
                {quote.data && (
                  <p>
                    {l.cash}: {formatMoney(quote.data.cashDifference)} ·{" "}
                    {l.points}: +{formatPoints(quote.data.walletCreditPoints)}
                  </p>
                )}
                <button
                  className="btn btn--secondary"
                  disabled={action.busy || !quote.data}
                  onClick={() => respond("TRANSFER")}
                >
                  {l.transfer}
                </button>
              </>
            )}
            {action.error && <p role="alert">{action.error}</p>}
            {d.choice === "TRANSFER" &&
              d.resolutionStatus === "AWAITING_PAYMENT" &&
              Date.parse(d.deadlineUtc) > now && (
                <button
                  className="btn btn--secondary"
                  disabled={action.busy}
                  onClick={() =>
                    action.run(async () => {
                      await api.post(
                        `/api/class-threshold-responses/${d.responseId}`,
                        { choice: d.choice, targetClassId: d.targetClassId },
                      );
                      state.reload();
                    })
                  }
                >
                  {l.retry}
                </button>
              )}
            {d.additionalInvoiceId && (
              <CheckoutPanel
                key={d.additionalInvoiceId}
                invoiceId={d.additionalInvoiceId}
                onChange={state.reload}
              />
            )}
            <button onClick={state.reload}>{l.refresh}</button>
          </>
        )
      )}
    </Card>
  );
}

"use client";
import {
  CounterPointConfirmation,
  type CounterConfirmation,
} from "./counter-point-confirmation";
import { paymentApi, type PurchaseIntent } from "./api";
export type { PurchaseIntent } from "./api";
import { useEffect, useRef, useState } from "react";
import { PaymentAttemptPanel } from "./payment-attempt-panel";
import { PointsSelector } from "./points-selector";
import { InvoiceStatus } from "./invoice-status";
import { HoldCountdown } from "./hold-countdown";
import { api, ApiError } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatPoints } from "@/lib/format";
import type {
  CheckoutDto,
  PaymentAttemptDto,
  WalletBalanceDto,
  InvoiceDetailDto,
} from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui";
function CheckoutFlow({
  intent,
  invoiceId,
  memberId: targetMemberId,
  onChange,
}: {
  intent?: PurchaseIntent;
  invoiceId?: string;
  memberId?: string;
  onChange?: () => void;
}) {
  const { t } = useLanguage();
  const l = t.refactor;
  const now = useNow(1000);
  const [checkout, setCheckout] = useState<CheckoutDto | null>(null);
  const [attempt, setAttempt] = useState<PaymentAttemptDto | null>(null);
  const { user } = useAuth();
  const memberId =
    user?.role === "Receptionist"
      ? (targetMemberId ?? checkout?.beneficiaryUserId)
      : undefined;
  const canSelectPoints =
    user?.role === "Member" ||
    user?.role === "ExternalCoach" ||
    user?.role === "Receptionist";
  const [points, setPoints] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const retryKey = useRef<string | null>(null);
  const key = useRef<string | null>(null);
  const alive = useRef(true);
  const [confirmation, setConfirmation] = useState<CounterConfirmation | null>(
    null,
  );
  const [retryQuote, setRetryQuote] = useState<{
    priceVersion: string;
    totalPrice: number;
    totalQuota: number;
    pricePerSession: number;
  } | null>(null);
  const [counterReady, setCounterReady] = useState(false);
  const [code, setCode] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const wallet = useApi(
    (signal) =>
      !canSelectPoints
        ? Promise.resolve(null)
        : api.get<WalletBalanceDto>(
            memberId ? `/api/members/${memberId}/points` : "/api/wallet/me",
            { signal },
          ),
    [memberId, canSelectPoints],
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!invoiceId) return;
    const controller = new AbortController();
    api
      .get<CheckoutDto>(`/api/checkouts/${invoiceId}`, {
        signal: controller.signal,
      })
      .then(setCheckout)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [invoiceId]);
  const detail = useApi(
    (signal) =>
      checkout?.invoiceId
        ? api.get<InvoiceDetailDto>(`/api/invoices/${checkout.invoiceId}`, {
            signal,
          })
        : Promise.resolve(null),
    [checkout?.invoiceId],
  );
  const id = checkout?.invoiceId;
  const status = checkout?.invoiceStatus;
  useEffect(() => {
    if (!id || !memberId) return;
    const controller = new AbortController();
    api
      .get<{
        confirmationId: string;
        expiresAtUtc: string;
        revision: number;
        points: number;
        failedAttempts: number;
        status: string;
        resendAtUtc: string;
      } | null>(`/api/invoices/${id}/point-confirmations/current`, {
        signal: controller.signal,
      })
      .then((c) => {
        if (!controller.signal.aborted) {
          setConfirmation(c);
          setCounterReady(true);
          if (c) setPoints(String(c.points));
          if (c) setResendAt(Date.parse(c.resendAtUtc));
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [id, memberId, checkout?.revision]);
  useEffect(() => {
    if (!id || status !== "ISSUED") return;
    const controller = new AbortController();
    let count = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api.get<CheckoutDto>(`/api/checkouts/${id}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setCheckout(next);
        if (next.invoiceStatus !== "ISSUED" || next.reconciliationRequired) {
          onChange?.();
          return;
        }
        if (
          ++count < 200 &&
          Date.parse(next.expiresAtUtc) >
            Date.parse(next.serverNowUtc ?? new Date().toISOString())
        )
          timer = setTimeout(poll, 3000);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError((e as Error).message);
          if (e instanceof ApiError && e.status === 403) {
            setCheckout(null);
            setAttempt(null);
          }
        }
      }
    };
    timer = setTimeout(poll, 3000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, status, onChange]);
  async function refresh() {
    if (!id) return;
    const next = await api.get<CheckoutDto>(`/api/checkouts/${id}`);
    if (alive.current) {
      setCheckout(next);
      wallet.reload();
      onChange?.();
    }
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (alive.current) {
        setError(
          e instanceof ApiError && (e.status === 0 || e.status >= 500)
            ? l.uncertain
            : (e as Error).message,
        );
        if (e instanceof ApiError && e.status === 403) {
          setCheckout(null);
          setAttempt(null);
        } else if (id) await refresh().catch(() => {});
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function create() {
    if (!intent) return;
    key.current ??= crypto.randomUUID();
    try {
      const next = await paymentApi.create(intent, key.current);
      if (alive.current) {
        setCheckout(next);
        window.history.replaceState(
          null,
          "",
          `/payments/return?invoiceId=${next.invoiceId}`,
        );
      }
    } catch (e) {
      if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) {
        const recovered = await paymentApi
          .recover(key.current)
          .catch(() => null);
        if (recovered) {
          setCheckout(recovered);
          window.history.replaceState(
            null,
            "",
            `/payments/return?invoiceId=${recovered.invoiceId}`,
          );
          return;
        }
      }
      throw e;
    }
  }
  const [clockOffset, setClockOffset] = useState(0);
  useEffect(() => {
    if (checkout?.serverNowUtc) {
      const offset = Date.parse(checkout.serverNowUtc) - Date.now();
      setTimeout(() => setClockOffset(offset), 0);
    }
  }, [checkout?.serverNowUtc]);
  const expired = checkout
    ? Date.parse(checkout.expiresAtUtc) <= now + clockOffset
    : false;
  const active =
    checkout?.invoiceStatus === "ISSUED" &&
    checkout.state === "ACTIVE" &&
    !expired &&
    !checkout.reconciliationRequired;
  const validPoints =
    /^\d+$/.test(points) &&
    Number.isSafeInteger(Number(points)) &&
    Number(points) >= 0 &&
    !!wallet.data &&
    Number(points) <=
      Math.min(
        wallet.data.availablePoints + (checkout?.pointsApplied ?? 0),
        Math.floor((checkout?.totalAmount ?? 0) / 1000),
      );
  return (
    <Card title={l.buy}>
      <div aria-live="polite">
        {error && <p role="alert">{error}</p>}
        {!checkout ? (
          <button
            className="btn btn--secondary"
            disabled={busy || !intent}
            onClick={() => run(create)}
          >
            {l.buy}
          </button>
        ) : (
          <>
            <p>
              {l.invoice}: {checkout.invoiceId}
            </p>
            {detail.data && (
              <>
                <p>
                  {detail.data.summary.memberName} ·{" "}
                  {detail.data.summary.memberEmail}
                </p>
                <ul>
                  {detail.data.items.map((item) => (
                    <li key={item.itemId}>
                      {item.description} · {formatMoney(item.lineAmount)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <InvoiceStatus checkout={checkout} />
            <dl>
              <dt>{l.total}</dt>
              <dd>{formatMoney(checkout.totalAmount)}</dd>
              <dt>{l.points}</dt>
              <dd>{formatPoints(checkout.pointsApplied)}</dd>
              <dt>{l.cash}</dt>
              <dd>{formatMoney(checkout.cashAmount)}</dd>
            </dl>
            <HoldCountdown
              expiresAtUtc={checkout.expiresAtUtc}
              serverNow={now + clockOffset}
            />
            {active && (
              <>
                {canSelectPoints && (
                  <>
                    <PointsSelector
                      value={points}
                      onChange={setPoints}
                      wallet={wallet.data}
                      totalAmount={checkout.totalAmount}
                      pointsApplied={checkout.pointsApplied}
                      disabled={busy || !!confirmation}
                    />
                    {wallet.error && <p role="alert">{wallet.error.message}</p>}
                    <button
                      className="btn btn--secondary"
                      disabled={
                        busy ||
                        !validPoints ||
                        !!confirmation ||
                        (!!memberId && !counterReady)
                      }
                      onClick={() =>
                        run(async () => {
                          setAttempt(null);
                          if (memberId && Number(points) === 0) {
                            await api.post(
                              `/api/invoices/${id}/point-confirmations/clear`,
                              { memberId, revision: checkout.revision },
                            );
                            setConfirmation(null);
                          } else if (memberId) {
                            const result = await api.post<{
                              confirmationId: string;
                              expiresAtUtc: string;
                              revision: number;
                            }>(`/api/invoices/${id}/point-confirmations`, {
                              memberId,
                              revision: checkout.revision,
                              points: Number(points),
                            });
                            setConfirmation(result);
                            setResendAt(Date.now() + 60000);
                          } else
                            await api.post(
                              `/api/wallet/me/checkouts/${id}/points`,
                              { points: Number(points) },
                            );
                          await refresh();
                        })
                      }
                    >
                      {memberId ? l.requestOtp : l.apply}
                    </button>
                    {confirmation && (
                      <CounterPointConfirmation
                        confirmation={confirmation}
                        code={code}
                        onCodeChange={setCode}
                        busy={busy}
                        serverNow={now + clockOffset}
                        resendAt={resendAt}
                        onVerify={() =>
                          run(async () => {
                            try {
                              await api.post(
                                `/api/point-confirmations/${confirmation.confirmationId}/verify`,
                                { code },
                              );
                            } catch (e) {
                              setConfirmation(
                                await api.get<CounterConfirmation | null>(
                                  `/api/invoices/${id}/point-confirmations/current`,
                                ),
                              );
                              throw e;
                            }
                            setConfirmation(null);
                            setCode("");
                            await refresh();
                          })
                        }
                        onClear={() =>
                          run(async () => {
                            await api.post(
                              `/api/invoices/${id}/point-confirmations/clear`,
                              { memberId, revision: checkout.revision },
                            );
                            setConfirmation(null);
                            setCode("");
                            await refresh();
                          })
                        }
                        onResend={() =>
                          run(async () => {
                            const next = await api.post<CounterConfirmation>(
                              `/api/invoices/${id}/point-confirmations`,
                              {
                                memberId,
                                revision: checkout.revision,
                                points: confirmation.points ?? Number(points),
                              },
                            );
                            setConfirmation(next);
                            setCode("");
                            setResendAt(Date.now() + 60000);
                            await refresh();
                          })
                        }
                      />
                    )}
                  </>
                )}
                <button
                  className="btn btn--secondary"
                  disabled={
                    busy ||
                    !!confirmation ||
                    (user?.role === "Receptionist" && !counterReady)
                  }
                  onClick={() =>
                    run(async () => {
                      if (checkout.cashAmount === 0) {
                        setCheckout(await paymentApi.confirmPoints(id!));
                        onChange?.();
                      } else setAttempt(await paymentApi.attempt(id!));
                    })
                  }
                >
                  {l.pay}
                </button>
                <button
                  className="btn btn--secondary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api.post(`/api/checkouts/${id}/cancel`);
                      setAttempt(null);
                      setConfirmation(null);
                      await refresh();
                    })
                  }
                >
                  {l.cancel}
                </button>
              </>
            )}
            {expired &&
              checkout.kind === "PT" &&
              checkout.ptMemberPackageId && (
                <>
                  <button
                    className="btn btn--secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        setRetryQuote(
                          await api.post("/api/checkouts/pt/quote", {
                            memberPackageId: checkout.ptMemberPackageId,
                            coachId: checkout.ptCoachId,
                            frequencyPerWeek: checkout.ptFrequency,
                            targetMemberId: memberId,
                          }),
                        );
                        retryKey.current = null;
                      })
                    }
                  >
                    {l.quote}
                  </button>
                  {retryQuote && (
                    <p>
                      {retryQuote.totalQuota} ×{" "}
                      {formatMoney(retryQuote.pricePerSession)} ={" "}
                      {formatMoney(retryQuote.totalPrice)}
                    </p>
                  )}
                </>
              )}
            {expired &&
              ["MEMBERSHIP", "CLASS", "PT", "COURT_RENTAL"].includes(
                checkout.kind,
              ) &&
              checkout.invoiceStatus === "ISSUED" &&
              !checkout.reconciliationRequired && (
                <button
                  className="btn btn--secondary"
                  disabled={
                    busy ||
                    (checkout.kind === "PT" &&
                      !retryQuote?.priceVersion &&
                      !intent?.body.priceVersion)
                  }
                  onClick={() =>
                    run(async () => {
                      const next = await api.post<CheckoutDto>(
                        `/api/checkouts/${id}/retry`,
                        {
                          priceVersion:
                            retryQuote?.priceVersion ??
                            intent?.body.priceVersion,
                        },
                        {
                          idempotencyKey: (retryKey.current ??=
                            crypto.randomUUID()),
                        },
                      );
                      setCheckout(next);
                      setAttempt(null);
                      window.history.replaceState(
                        null,
                        "",
                        `/payments/return?invoiceId=${next.invoiceId}`,
                      );
                    })
                  }
                >
                  {l.retry}
                </button>
              )}
            {attempt &&
              active &&
              checkout.cashAmount > 0 &&
              attempt.cashAmount === checkout.cashAmount &&
              attempt.pointsApplied === checkout.pointsApplied &&
              Date.parse(attempt.expiresAtUtc) > now + clockOffset && (
                <PaymentAttemptPanel
                  key={attempt.paymentAttemptId}
                  attempt={attempt}
                />
              )}
            <button
              className="btn btn--secondary"
              disabled={busy}
              onClick={() => run(refresh)}
            >
              {l.refresh}
            </button>
            {(user?.role === "Receptionist" ||
              user?.role === "CenterManager") &&
              checkout.reconciliationRequired && (
                <button
                  className="btn btn--secondary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api.post(`/api/invoices/${id}/reconcile`);
                      await refresh();
                    })
                  }
                >
                  {l.reconcile}
                </button>
              )}
          </>
        )}
      </div>
    </Card>
  );
}

export function CheckoutPanel(props: {
  intent?: PurchaseIntent;
  invoiceId?: string;
  memberId?: string;
  onChange?: () => void;
}) {
  const { user } = useAuth();
  return (
    <CheckoutFlow
      key={`${user?.userId ?? "guest"}-${props.invoiceId ?? ""}-${props.memberId ?? ""}-${JSON.stringify(props.intent ?? null)}`}
      {...props}
    />
  );
}

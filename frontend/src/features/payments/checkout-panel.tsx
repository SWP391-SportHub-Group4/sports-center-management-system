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
import { Button, buttonClass } from "@/components/primitives";
import Link from "next/link";
import { toCheckoutViewModel } from "./checkout.contract";
import styles from "./checkout-panel.module.css";

type CheckoutReview = {
  title: string;
  submitLabel: string;
  items: { label: string; value: string }[];
};

function CheckoutFlow({
  intent,
  invoiceId,
  memberId: targetMemberId,
  onChange,
  onAccessChanged,
  review,
}: {
  intent?: PurchaseIntent;
  invoiceId?: string;
  memberId?: string;
  onChange?: () => void;
  onAccessChanged?: () => void;
  review?: CheckoutReview;
}) {
  const { t } = useLanguage();
  const l = t.refactor;
  const now = useNow(1000);
  // Số phút giữ chỗ do Manager cấu hình (`hold.minutes`); chưa tải được thì không nêu con số.
  const policy = useApi((signal) => paymentApi.policy(signal), []);
  const [checkout, setCheckout] = useState<CheckoutDto | null>(null);
  const [attempt, setAttempt] = useState<PaymentAttemptDto | null>(null);
  const { user } = useAuth();
  const memberId =
    user?.role === "Receptionist"
      ? (targetMemberId ?? checkout?.beneficiaryUserId)
      : undefined;
  const canSelectPoints =
    user?.role === "Member" || user?.role === "Receptionist";
  // Điểm đang soạn gắn với revision: server đổi đơn (ví dụ ở tab khác) thì bản nháp cũ bị bỏ và ô
  // nhập quay về số điểm server đang áp dụng, thay vì ghi đè mù.
  const [draft, setDraft] = useState<{
    value: string;
    revision: number;
  } | null>(null);
  const points =
    draft && draft.revision === checkout?.revision
      ? draft.value
      : String(checkout?.pointsApplied ?? 0);
  const setPoints = (value: string) =>
    setDraft({ value, revision: checkout?.revision ?? -1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{
    cause: unknown;
    uncertain?: boolean;
  } | null>(null);
  const errorMessage = error?.uncertain
    ? l.uncertain
    : error?.cause instanceof ApiError &&
        error.cause.code === "duplicate_active_package"
      ? t.apiErrors.duplicateActivePackage
      : error?.cause instanceof Error
        ? error.cause.message
        : error
          ? t.apiErrors.generic
          : "";
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
        if (!controller.signal.aborted) setError({ cause: e });
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
          if (c)
            setDraft({
              value: String(c.points),
              revision: checkout?.revision ?? -1,
            });
          if (c) setResendAt(Date.parse(c.resendAtUtc));
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError({ cause: e });
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
          setError({ cause: e });
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
    setError(null);
    try {
      await action();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 409))
        onAccessChanged?.();
      if (alive.current) {
        setError({
          cause: e,
          uncertain:
            e instanceof ApiError && (e.status === 0 || e.status >= 500),
        });
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
        window.history.replaceState(null, "", `/checkout/${next.invoiceId}`);
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
            `/checkout/${recovered.invoiceId}`,
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
        Math.floor(
          (checkout?.totalAmount ?? 0) / (wallet.data.vndPerPoint || 1000),
        ),
      );

  // Hết giờ: dừng thao tác cũ và hỏi lại server. FE không có quyền "release slot" — job backend xử lý.
  const expiryFetched = useRef<string | null>(null);
  useEffect(() => {
    if (!expired || !id || status !== "ISSUED" || expiryFetched.current === id)
      return;
    expiryFetched.current = id;
    api
      .get<CheckoutDto>(`/api/checkouts/${id}`)
      .then((next) => {
        if (alive.current) setCheckout(next);
      })
      .catch(() => {});
  }, [expired, id, status]);
  // Quay lại tab: số dư điểm hoặc đơn có thể đã đổi ở nơi khác.
  const reloadWallet = wallet.reload;
  useEffect(() => {
    if (!id || status !== "ISSUED") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      reloadWallet();
      api
        .get<CheckoutDto>(`/api/checkouts/${id}`)
        .then((next) => {
          if (alive.current) setCheckout(next);
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [id, status, reloadWallet]);
  const vm = checkout
    ? toCheckoutViewModel(checkout, {
        mode: memberId ? "COUNTER" : "SELF",
        beneficiaryName: detail.data?.summary.memberName,
        initiatorName: user?.fullName,
      })
    : null;
  const serverNow = now + clockOffset;
  const pointsValue = checkout ? checkout.totalAmount - checkout.cashAmount : 0;
  const showExpiredRetry =
    expired &&
    ["MEMBERSHIP", "CLASS", "PT", "COURT_RENTAL"].includes(
      checkout?.kind ?? "",
    ) &&
    checkout?.invoiceStatus === "ISSUED" &&
    !checkout.reconciliationRequired;
  if (!checkout || !vm)
    return (
      <Card title={review ? review.title : l.buy}>
        <div aria-live="polite">
          {errorMessage && <p role="alert">{errorMessage}</p>}
          {review && (
            <dl className={styles.review}>
              {review.items.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {policy.data && (
            <p className={styles.note}>
              {t.checkout.holdRule.replace(
                "{minutes}",
                String(policy.data.holdMinutes),
              )}
              {intent?.kind === "class" && ` ${t.checkout.holdRuleClass}`}
            </p>
          )}
          <Button
            variant="primary"
            loading={busy}
            disabled={!intent}
            onClick={() => run(create)}
          >
            {review?.submitLabel ?? l.buy}
          </Button>
        </div>
      </Card>
    );
  return (
    <div className={styles.layout}>
      <div className={styles.steps} aria-live="polite">
        {errorMessage && (
          <p role="alert" className={styles.alert}>
            {errorMessage}
          </p>
        )}
        <InvoiceStatus checkout={checkout} />
        {vm.phase === "FULFILLED" && user?.role === "Member" && (
          <div className={styles.actions}>
            <Link
              className={buttonClass()}
              href={
                checkout.kind === "CLASS"
                  ? "/member/courses"
                  : checkout.kind === "COURT_RENTAL"
                    ? "/member/rentals"
                    : checkout.kind === "PT"
                      ? "/member/services?tab=pt"
                      : "/member/services?tab=gym"
              }
            >
              {checkout.kind === "CLASS"
                ? t.checkout.nextCourse
                : checkout.kind === "COURT_RENTAL"
                  ? t.checkout.nextRental
                  : checkout.kind === "PT"
                    ? t.checkout.nextPt
                    : t.checkout.nextMembership}
            </Link>
            <Link
              className={buttonClass({ variant: "secondary" })}
              href={`/member/invoices/${checkout.invoiceId}`}
            >
              {t.checkout.viewInvoice}
            </Link>
            <Link className={buttonClass({ variant: "ghost" })} href="/member">
              {t.checkout.nextDashboard}
            </Link>
          </div>
        )}
        <section className={styles.step} aria-labelledby="checkout-step-order">
          <h2 className={styles.stepTitle} id="checkout-step-order">
            <span className={styles.stepNo} aria-hidden="true">
              1
            </span>
            {t.checkout.stepService}
          </h2>
          {detail.data ? (
            <ul className={styles.items}>
              {detail.data.items.map((item) => (
                <li key={item.itemId}>
                  <span>{item.description}</span>
                  <span className={styles.money}>
                    {formatMoney(item.lineAmount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.note}>{t.checkout.loadingOrder}</p>
          )}
        </section>
        {active && canSelectPoints && (
          <section
            className={styles.step}
            aria-labelledby="checkout-step-points"
          >
            <h2 className={styles.stepTitle} id="checkout-step-points">
              <span className={styles.stepNo} aria-hidden="true">
                2
              </span>
              {t.checkout.stepPoints}
            </h2>
            {vm.pointsAuth === "OTP_EMAIL" && (
              <p className={styles.note}>{t.checkout.pointsOtpNote}</p>
            )}
            <PointsSelector
              value={points}
              onChange={setPoints}
              wallet={wallet.data}
              totalAmount={checkout.totalAmount}
              pointsApplied={checkout.pointsApplied}
              disabled={busy || !!confirmation}
            />
            {wallet.error && (
              <p role="alert" className={styles.alert}>
                {wallet.error.message}
              </p>
            )}
            <div className={styles.actions}>
              <Button
                variant="secondary"
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
                      await api.post(`/api/wallet/me/checkouts/${id}/points`, {
                        points: Number(points),
                      });
                    await refresh();
                  })
                }
              >
                {memberId ? l.requestOtp : l.apply}
              </Button>
            </div>
            {confirmation && (
              <CounterPointConfirmation
                confirmation={confirmation}
                code={code}
                onCodeChange={setCode}
                busy={busy}
                serverNow={serverNow}
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
          </section>
        )}
        {active && (
          <section
            className={styles.step}
            aria-labelledby="checkout-step-payment"
          >
            <h2 className={styles.stepTitle} id="checkout-step-payment">
              <span className={styles.stepNo} aria-hidden="true">
                {canSelectPoints ? 3 : 2}
              </span>
              {t.checkout.stepPayment}
            </h2>
            <p className={styles.note}>
              {vm.next === "CONFIRM_POINTS" ? (
                t.checkout.nextPoints
              ) : (
                <>
                  {t.checkout.nextGateway}{" "}
                  <strong className={styles.money}>
                    {formatMoney(checkout.cashAmount)}
                  </strong>
                </>
              )}
            </p>
            <div className={styles.actions}>
              <Button
                variant="primary"
                size="lg"
                loading={busy}
                disabled={
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
              </Button>
              <Button
                variant="ghost"
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
              </Button>
            </div>
            {attempt &&
              checkout.cashAmount > 0 &&
              attempt.cashAmount === checkout.cashAmount &&
              attempt.pointsApplied === checkout.pointsApplied &&
              Date.parse(attempt.expiresAtUtc) > serverNow && (
                <div className={styles.attempt}>
                  <PaymentAttemptPanel
                    key={attempt.paymentAttemptId}
                    attempt={attempt}
                  />
                </div>
              )}
          </section>
        )}
        {expired && checkout.kind === "PT" && checkout.ptMemberPackageId && (
          <div className={styles.actions}>
            <Button
              variant="secondary"
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
            </Button>
            {retryQuote && (
              <p className={styles.money}>
                {retryQuote.totalQuota} ×{" "}
                {formatMoney(retryQuote.pricePerSession)} ={" "}
                {formatMoney(retryQuote.totalPrice)}
              </p>
            )}
          </div>
        )}
        {showExpiredRetry && (
          <div className={styles.actions}>
            <Button
              variant="primary"
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
                        retryQuote?.priceVersion ?? intent?.body.priceVersion,
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
                    `/checkout/${next.invoiceId}`,
                  );
                })
              }
            >
              {l.retry}
            </Button>
          </div>
        )}
        <div className={styles.actions}>
          <Button variant="quiet" disabled={busy} onClick={() => run(refresh)}>
            {l.refresh}
          </Button>
          {(user?.role === "Receptionist" || user?.role === "CenterManager") &&
            checkout.reconciliationRequired && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api.post(`/api/invoices/${id}/reconcile`);
                    await refresh();
                  })
                }
              >
                {l.reconcile}
              </Button>
            )}
        </div>
      </div>
      <aside className={styles.summary} aria-label={t.checkout.summary}>
        <h2 className={styles.summaryTitle}>{t.checkout.summary}</h2>
        <p className={styles.who}>
          <span>
            {l.invoice}:{" "}
            <strong>
              {detail.data?.summary.invoiceNumber ?? checkout.invoiceId}
            </strong>
          </span>
          {vm.mode === "COUNTER" ? (
            <>
              <span>
                {t.checkout.counterFor}:{" "}
                <strong>
                  {vm.beneficiary.displayName ?? t.checkout.buyer}
                </strong>
              </span>
              <span>
                {t.checkout.operator}:{" "}
                <strong>
                  {vm.initiator.displayName ?? t.common.receptionist}
                </strong>
              </span>
            </>
          ) : (
            <span>
              {t.checkout.buyer}:{" "}
              <strong>
                {vm.beneficiary.displayName ?? t.checkout.buyerSelf}
              </strong>
            </span>
          )}
        </p>
        <dl className={styles.rows}>
          <div>
            <dt>{t.checkout.totalLine}</dt>
            <dd>{formatMoney(vm.totalAmount)}</dd>
          </div>
          <div>
            <dt>{t.checkout.pointsLine}</dt>
            <dd>
              {formatPoints(vm.pointsApplied)} {l.points.toLowerCase()}
              {vm.pointsApplied > 0 && <> (−{formatMoney(pointsValue)})</>}
            </dd>
          </div>
          <div className={styles.rowsTotal}>
            <dt>{t.checkout.cashLine}</dt>
            <dd>{formatMoney(vm.cashAmount)}</dd>
          </div>
        </dl>
        {vm.phase === "AWAITING_PAYMENT" && (
          <HoldCountdown
            expiresAtUtc={vm.expiresAtUtc}
            serverNow={serverNow}
            showSource
          />
        )}
      </aside>
    </div>
  );
}

export function CheckoutPanel(props: {
  intent?: PurchaseIntent;
  invoiceId?: string;
  memberId?: string;
  onChange?: () => void;
  onAccessChanged?: () => void;
  review?: CheckoutReview;
}) {
  const { user } = useAuth();
  return (
    <CheckoutFlow
      key={`${user?.userId ?? "guest"}-${props.invoiceId ?? ""}-${props.memberId ?? ""}-${JSON.stringify(props.intent ?? null)}`}
      {...props}
    />
  );
}

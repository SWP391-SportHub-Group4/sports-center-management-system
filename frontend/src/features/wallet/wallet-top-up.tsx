"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  Copy,
  CreditCard,
  Info,
  Repeat,
  ShieldCheck,
  ShoppingCart,
  Wallet,
  Zap,
} from "lucide-react";
import { Button, buttonClass } from "@/components/primitives";
import { api, ApiError } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import { formatMoney, formatPoints } from "@/lib/format";
import { walletApi } from "./api";
import {
  HoldCountdown,
  InvoiceStatus,
  PaymentResult,
  derivePhase,
  openPaymentGateway,
  paymentApi,
} from "@/features/payments";
import type { CheckoutDto, InvoiceDetailDto } from "@/lib/types";
import styles from "./wallet-top-up.module.css";

const VND_PER_POINT = 1000;
const MIN_VND = 10_000;
const MAX_VND = 10_000_000;
const PRESETS = [
  { label: "50K", value: 50_000 },
  { label: "100K", value: 100_000 },
  { label: "200K", value: 200_000 },
  { label: "500K", value: 500_000 },
  { label: "1M", value: 1_000_000 },
  { label: "2M", value: 2_000_000 },
];
/** VNPay sandbox test card (public). Hidden in production with NEXT_PUBLIC_VNPAY_SANDBOX=false. */
const SHOW_SANDBOX = process.env.NEXT_PUBLIC_VNPAY_SANDBOX !== "false";
const SANDBOX_CARD = [
  { label: "Bank", value: "NCB" },
  { label: "Card number", value: "9704198526191432198", copy: true },
  { label: "Cardholder", value: "NGUYEN VAN A", copy: true },
  { label: "Issue date", value: "07/15", copy: true },
  { label: "OTP", value: "123456", copy: true },
];
const SUCCESS_NOTE =
  "After a successful top-up, SportHub Points are added to your account automatically. To buy a membership, use SportHub Points on the Services page.";

function parseAmount(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  return { digits, amount: digits ? Number(digits) : 0 };
}
function validate(amount: number): { ok: boolean; message: string } {
  if (!amount) return { ok: false, message: "" };
  if (amount < MIN_VND)
    return { ok: false, message: `Minimum top-up is ${formatMoney(MIN_VND)}.` };
  if (amount > MAX_VND)
    return { ok: false, message: `Maximum top-up is ${formatMoney(MAX_VND)}.` };
  if (amount % VND_PER_POINT !== 0)
    return {
      ok: false,
      message: `Amount must be a multiple of ${formatMoney(VND_PER_POINT)}.`,
    };
  return { ok: true, message: "Valid amount. You can continue to payment." };
}

function messageOf(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.code === "payment_reconciliation_pending")
      return "We are confirming a payment on this top-up. Please wait a moment before making changes.";
    if (error.code === "checkout_already_paid")
      return "This top-up has already been paid.";
    if (error.status === 429)
      return "Too many attempts. Please wait a few seconds and try again.";
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Member points top-up: step 1 choose an amount, step 2 pay through VNPay. */
export function WalletTopUp() {
  const [digits, setDigits] = useState("");
  const [checkout, setCheckout] = useState<CheckoutDto | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState<"create" | "pay" | "change" | null>(null);
  const [error, setError] = useState("");
  const createKey = useRef<string | null>(null);
  const alive = useRef(true);
  const balance = useApi((signal) => walletApi.balance(signal), []);
  const { amount } = parseAmount(digits);
  const check = validate(amount);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const remember = useCallback((invoiceId: string | null) => {
    const url = new URL(window.location.href);
    if (invoiceId) url.searchParams.set("invoice", invoiceId);
    else url.searchParams.delete("invoice");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, []);

  // Reload or Back from VNPay: resume the open top-up recorded in the URL.
  useEffect(() => {
    const invoiceId = new URLSearchParams(window.location.search).get(
      "invoice",
    );
    const controller = new AbortController();
    if (!invoiceId) {
      const timer = setTimeout(() => setRestoring(false), 0);
      return () => clearTimeout(timer);
    }
    paymentApi
      .get(invoiceId, controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return;
        if (found.kind !== "WALLET_TOP_UP") remember(null);
        else setCheckout(found);
      })
      .catch(() => {
        if (!controller.signal.aborted) remember(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRestoring(false);
      });
    return () => controller.abort();
  }, [remember]);

  async function createCheckout() {
    if (!check.ok || busy) return;
    setBusy("create");
    setError("");
    try {
      const next = await paymentApi.create(
        {
          kind: "wallet-top-up",
          body: { points: amount / VND_PER_POINT },
        },
        // A double click or retry after a network drop reuses the same checkout.
        (createKey.current ??= `${crypto.randomUUID()}`),
      );
      if (!alive.current) return;
      setCheckout(next);
      remember(next.invoiceId);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) {
        const recovered = await paymentApi
          .recover(createKey.current!)
          .catch(() => null);
        if (recovered && alive.current) {
          setCheckout(recovered);
          remember(recovered.invoiceId);
          return;
        }
      }
      if (alive.current)
        setError(messageOf(e, "We couldn't prepare your top-up. Try again."));
    } finally {
      if (alive.current) setBusy(null);
    }
  }

  async function changeAmount() {
    if (!checkout || busy) return;
    setBusy("change");
    setError("");
    try {
      await paymentApi.cancel(checkout.invoiceId);
      if (!alive.current) return;
      setDigits(String(Math.round(checkout.totalAmount)));
      createKey.current = null;
      setCheckout(null);
      remember(null);
    } catch (e) {
      if (!alive.current) return;
      setError(messageOf(e, "We couldn't change the amount. Try again."));
      // The server may have moved on (paid, expired): show its real state.
      paymentApi
        .get(checkout.invoiceId)
        .then((latest) => alive.current && setCheckout(latest))
        .catch(() => {});
    } finally {
      if (alive.current) setBusy(null);
    }
  }

  function startOver() {
    setCheckout(null);
    setDigits("");
    setError("");
    createKey.current = null;
    remember(null);
  }

  const step = checkout ? 2 : 1;
  return (
    <div className={styles.page}>
      <section className={styles.card} aria-labelledby="top-up-title">
        <header className={styles.head}>
          <div className={styles.brand}>
            <span className={styles.brandIcon} aria-hidden="true">
              <Wallet size={20} />
            </span>
            <h2 id="top-up-title">
              Add <strong>SportHub Points</strong>
            </h2>
          </div>
          <span className={styles.rate}>
            <Repeat size={14} aria-hidden="true" />1 point ={" "}
            {formatMoney(VND_PER_POINT)}
          </span>
        </header>

        <ol className={styles.steps} aria-label="Top-up steps">
          <li data-state={step === 1 ? "current" : "done"}>
            <span aria-hidden="true">
              {step === 1 ? "1" : <Check size={16} />}
            </span>
            Enter amount
          </li>
          <li className={styles.line} aria-hidden="true" />
          <li data-state={step === 2 ? "current" : "todo"}>
            <span aria-hidden="true">2</span>
            Payment
          </li>
        </ol>

        {restoring ? (
          <p className={styles.loading} role="status">
            Loading your top-up…
          </p>
        ) : checkout ? (
          <PaymentStep
            key={checkout.invoiceId}
            checkout={checkout}
            onCheckout={setCheckout}
            busy={busy}
            error={error}
            onError={setError}
            onPay={async () => {
              if (busy) return;
              setBusy("pay");
              setError("");
              try {
                openPaymentGateway(
                  await paymentApi.attempt(checkout.invoiceId),
                );
              } catch (e) {
                if (!alive.current) return;
                setError(
                  messageOf(e, "We couldn't open VNPay. Please try again."),
                );
                paymentApi
                  .get(checkout.invoiceId)
                  .then((latest) => alive.current && setCheckout(latest))
                  .catch(() => {});
                setBusy(null);
              }
            }}
            onChangeAmount={changeAmount}
            onStartOver={startOver}
          />
        ) : (
          <AmountStep
            digits={digits}
            amount={amount}
            check={check}
            busy={busy === "create"}
            error={error}
            onDigits={(value) => {
              setDigits(value);
              setError("");
              createKey.current = null;
            }}
            onSubmit={createCheckout}
            balance={balance.data?.availablePoints}
          />
        )}
      </section>

      <section className={styles.perks} aria-label="Top-up benefits">
        <div>
          <Zap size={18} aria-hidden="true" />
          <p>
            <strong>Instant</strong>
            <span>
              Checkout is created at once; points are added automatically.
            </span>
          </p>
        </div>
        <div>
          <ShieldCheck size={18} aria-hidden="true" />
          <p>
            <strong>Secure</strong>
            <span>Paid on VNPay, confirmed by the SportHub server.</span>
          </p>
        </div>
        <div>
          <Coins size={18} aria-hidden="true" />
          <p>
            <strong>Automatic</strong>
            <span>No manual approval. Points never expire.</span>
          </p>
        </div>
      </section>

      <section className={styles.promo} aria-labelledby="top-up-membership">
        <span className={styles.promoIcon} aria-hidden="true">
          <ShoppingCart size={20} />
        </span>
        <div>
          <h3 id="top-up-membership">Buy a membership</h3>
          <p>
            <strong>Step 1:</strong> Add SportHub Points →{" "}
            <strong>Step 2:</strong> Pay for your plan
          </p>
          <Link href="/member/services" className={buttonClass({ size: "sm" })}>
            View services
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className={styles.notes} aria-labelledby="top-up-notes">
        <span className={styles.promoIcon} aria-hidden="true">
          <Info size={20} />
        </span>
        <div>
          <h3 id="top-up-notes">Important notes</h3>
          <ul>
            <li>Pay the exact amount</li>
            <li>Finish before the timer ends</li>
            <li>Paid but no points? Check Invoices</li>
            <li>
              Support: <strong className={styles.support}>Soicodoc</strong>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function AmountStep({
  digits,
  amount,
  check,
  busy,
  error,
  onDigits,
  onSubmit,
  balance,
}: {
  digits: string;
  amount: number;
  check: { ok: boolean; message: string };
  busy: boolean;
  error: string;
  onDigits: (value: string) => void;
  onSubmit: () => void;
  balance?: number;
}) {
  const invalid = !!digits && !check.ok;
  const tone = !digits ? "idle" : check.ok ? "ok" : "bad";
  return (
    <form
      className={styles.amountStep}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h3 className={styles.question}>How much do you want to add?</h3>
      <p className={styles.sub}>
        Enter an amount and receive SportHub Points right after payment.
        {balance !== undefined && (
          <> You now have {formatPoints(balance)} points.</>
        )}
      </p>
      <label className={styles.amountBox} data-invalid={invalid || undefined}>
        <span className={styles.srOnly}>Amount in VND</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="0"
          value={digits ? new Intl.NumberFormat("en-GB").format(amount) : ""}
          onChange={(event) => onDigits(parseAmount(event.target.value).digits)}
          aria-invalid={invalid}
          aria-describedby="top-up-hint"
        />
        <span className={styles.unit} aria-hidden="true">
          ₫
        </span>
      </label>
      <p
        id="top-up-hint"
        className={styles.hint}
        data-tone={tone}
        role={invalid ? "alert" : "status"}
      >
        <Info size={14} aria-hidden="true" />
        {check.message ||
          `Minimum ${formatMoney(MIN_VND)} • Maximum ${formatMoney(MAX_VND)}`}
      </p>
      <div className={styles.presets} role="group" aria-label="Quick amounts">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            aria-pressed={amount === preset.value}
            onClick={() => onDigits(String(preset.value))}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <dl className={styles.quote}>
        <div>
          <dt>You pay</dt>
          <dd>{formatMoney(check.ok ? amount : 0)}</dd>
        </div>
        <div className={styles.quoteGet}>
          <dt>
            <Coins size={14} aria-hidden="true" /> You receive
          </dt>
          <dd>
            {formatPoints(check.ok ? amount / VND_PER_POINT : 0)}{" "}
            <small>points</small>
          </dd>
        </div>
      </dl>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        block
        loading={busy}
        disabled={!check.ok}
        icon={<CreditCard size={18} aria-hidden="true" />}
      >
        Continue to payment
        <ArrowRight size={18} aria-hidden="true" />
      </Button>
    </form>
  );
}

function PaymentStep({
  checkout,
  onCheckout,
  busy,
  error,
  onError,
  onPay,
  onChangeAmount,
  onStartOver,
}: {
  checkout: CheckoutDto;
  onCheckout: (next: CheckoutDto) => void;
  busy: "create" | "pay" | "change" | null;
  error: string;
  onError: (message: string) => void;
  onPay: () => void;
  onChangeAmount: () => void;
  onStartOver: () => void;
}) {
  const now = useNow(1000);
  const [clockOffset, setClockOffset] = useState(0);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState("");
  const phase = derivePhase(checkout);
  const open = phase === "AWAITING_PAYMENT";
  const serverNow = now + clockOffset;
  const expired = open && Date.parse(checkout.expiresAtUtc) <= serverNow;
  const points = Math.round(checkout.totalAmount / VND_PER_POINT);
  const detail = useApi(
    (signal) =>
      open
        ? Promise.resolve(null)
        : api.get<InvoiceDetailDto>(`/api/invoices/${checkout.invoiceId}`, {
            signal,
          }),
    [checkout.invoiceId, open],
  );

  useEffect(() => {
    if (!checkout.serverNowUtc) return;
    const offset = Date.parse(checkout.serverNowUtc) - Date.now();
    const timer = setTimeout(() => setClockOffset(offset), 0);
    return () => clearTimeout(timer);
  }, [checkout.serverNowUtc]);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      onCheckout(await paymentApi.get(checkout.invoiceId));
    } catch (e) {
      onError(messageOf(e, "We couldn't check the payment. Try again."));
    } finally {
      setChecking(false);
    }
  }, [checkout.invoiceId, onCheckout, onError]);

  // The server is the source of truth: poll while open, and when returning to the tab.
  useEffect(() => {
    if (!["AWAITING_PAYMENT", "PAID_PENDING_FULFILLMENT"].includes(phase))
      return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    const poll = async () => {
      try {
        const next = await paymentApi.get(
          checkout.invoiceId,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        onCheckout(next);
        if (++count < 200) timer = setTimeout(poll, 3000);
      } catch {
        if (!controller.signal.aborted && ++count < 200)
          timer = setTimeout(poll, 6000);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    timer = setTimeout(poll, 3000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkout.invoiceId, phase, onCheckout, refresh]);

  if (!open || expired) {
    return (
      <div className={styles.result}>
        <PaymentResult
          checkout={checkout}
          detail={detail.data}
          checking={checking}
          error={error}
          onRefresh={() => void refresh()}
        />
        {(phase === "VOID" || expired) && (
          <Button variant="secondary" onClick={onStartOver}>
            Start a new top-up
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.pay}>
      <div className={styles.payMain}>
        <h3 className={styles.question}>Pay with VNPay</h3>
        <p className={styles.sub}>
          Review your order, then pay securely on the VNPay gateway.
        </p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <InvoiceStatus checkout={checkout} />

        <section className={styles.panel} aria-labelledby="top-up-order">
          <h4 id="top-up-order">
            <span aria-hidden="true">1</span>Your order
          </h4>
          <div className={styles.orderLine}>
            <div>
              <strong className={styles.orderTitle}>
                Top up {formatPoints(points)} points
              </strong>
              <p className={styles.orderNote}>{SUCCESS_NOTE}</p>
            </div>
            <span className={styles.money}>
              {formatMoney(checkout.totalAmount)}
            </span>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="top-up-pay">
          <h4 id="top-up-pay">
            <span aria-hidden="true">2</span>Payment
          </h4>
          <p className={styles.payNote}>
            The remaining amount is paid through the payment gateway:{" "}
            <strong className={styles.money}>
              {formatMoney(checkout.cashAmount)}
            </strong>
          </p>
          {SHOW_SANDBOX && (
            <div className={styles.sandbox}>
              <p className={styles.sandboxTitle}>
                <CreditCard size={16} aria-hidden="true" />
                VNPay sandbox — use this test card
              </p>
              <dl>
                {SANDBOX_CARD.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>
                      <code>{row.value}</code>
                      {row.copy && (
                        <button
                          type="button"
                          aria-label={`Copy ${row.label}`}
                          onClick={() => {
                            void navigator.clipboard
                              ?.writeText(row.value)
                              .then(() => {
                                setCopied(row.label);
                                setTimeout(() => setCopied(""), 1500);
                              })
                              .catch(() => {});
                          }}
                        >
                          {copied === row.label ? (
                            <Check size={14} />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className={styles.sandboxNote}>
                Test money only. No real charge is made in the sandbox.
              </p>
            </div>
          )}
          <div className={styles.actions}>
            <Button
              size="lg"
              loading={busy === "pay"}
              disabled={busy !== null}
              onClick={onPay}
            >
              Pay with VNPay
            </Button>
            <Button
              variant="secondary"
              size="lg"
              loading={busy === "change"}
              disabled={busy !== null}
              icon={<ArrowLeft size={16} aria-hidden="true" />}
              onClick={onChangeAmount}
            >
              Change amount
            </Button>
          </div>
        </section>
      </div>

      <aside className={styles.summary} aria-label="Order summary">
        <h4>Order summary</h4>
        <dl>
          <div>
            <dt>Top-up</dt>
            <dd>{formatPoints(points)} points</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd className={styles.money}>
              {formatMoney(checkout.totalAmount)}
            </dd>
          </div>
          <div className={styles.summaryTotal}>
            <dt>Pay via gateway</dt>
            <dd>{formatMoney(checkout.cashAmount)}</dd>
          </div>
        </dl>
        <HoldCountdown
          expiresAtUtc={checkout.expiresAtUtc}
          serverNow={serverNow}
          showSource
        />
      </aside>
    </div>
  );
}

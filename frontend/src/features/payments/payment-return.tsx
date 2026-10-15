"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckoutPanel } from "./checkout-panel";
import { PaymentResult } from "./payment-result";
import { derivePhase } from "./checkout.contract";
import { Button, buttonClass } from "@/components/primitives";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import type { CheckoutDto, InvoiceDetailDto } from "@/lib/types";
import styles from "./payment-result.module.css";

export function PaymentReturn({
  invoiceId,
  embedded = false,
}: { invoiceId?: string; embedded?: boolean } = {}) {
  const { user, loading } = useAuth();
  const userId = user?.userId;
  const [checkout, setCheckout] = useState<CheckoutDto | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [next, setNext] = useState("/payments/return");
  const id = checkout?.invoiceId;
  const detail = useApi(
    (signal) =>
      id
        ? api.get<InvoiceDetailDto>("/api/invoices/" + id, { signal })
        : Promise.resolve(null),
    [id],
  );

  useEffect(() => {
    if (invoiceId || loading) return;
    const controller = new AbortController();
    const resolve = async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setNext(window.location.pathname + window.location.search);
      if (!userId) {
        setChecking(false);
        return;
      }
      setChecking(true);
      setError("");
      const query = new URLSearchParams(window.location.search);
      const reference = query.get("vnp_TxnRef");
      const legacyId = query.get("invoiceId");
      try {
        let current: CheckoutDto;
        if (reference) {
          current = await api.get<CheckoutDto>("/api/checkouts/by-reference", {
            query: { reference },
            signal: controller.signal,
          });
        } else if (legacyId && /^[0-9a-f-]{36}$/i.test(legacyId)) {
          current = await api.get<CheckoutDto>("/api/checkouts/" + legacyId, {
            signal: controller.signal,
          });
        } else
          throw new Error(
            "We couldn't find this checkout. Open your invoice to review its status.",
          );
        if (controller.signal.aborted) return;
        setCheckout(current);
        // The URL identifies the attempt only. Confirmation comes from the backend's signed QueryDR.
        if (
          reference &&
          ["AWAITING_PAYMENT", "VOID"].includes(derivePhase(current))
        ) {
          const verified = await api.post<CheckoutDto>(
            "/api/checkouts/verify-reference",
            { reference },
            { signal: controller.signal },
          );
          if (!controller.signal.aborted) setCheckout(verified);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "We couldn't confirm your payment yet. Please check again.",
          );
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    };
    void resolve();
    return () => controller.abort();
  }, [invoiceId, userId, loading, refreshVersion]);

  const phase = checkout ? derivePhase(checkout) : null;
  useEffect(() => {
    if (
      !id ||
      checking ||
      !["AWAITING_PAYMENT", "PAID_PENDING_FULFILLMENT"].includes(phase ?? "")
    )
      return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    const poll = async () => {
      try {
        const updated = await api.get<CheckoutDto>("/api/checkouts/" + id, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setCheckout(updated);
        if (
          ++count < 60 &&
          ["AWAITING_PAYMENT", "PAID_PENDING_FULFILLMENT"].includes(
            derivePhase(updated),
          )
        )
          timer = setTimeout(poll, 3000);
      } catch {
        if (!controller.signal.aborted)
          setError(
            (previous) =>
              previous ||
              "We couldn't refresh the payment status. Please check again.",
          );
      }
    };
    timer = setTimeout(poll, 3000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, phase, checking]);

  const body = loading ? (
    <section className={styles.loading} aria-busy="true" role="status">
      <h2>Loading your payment</h2>
      <p>Getting your account and checkout details.</p>
    </section>
  ) : !user ? (
    <section className={styles.loading}>
      <h2>View your payment result</h2>
      <p>
        Sign in to the account used for this purchase to securely check its
        status.
      </p>
      <Link
        className={buttonClass()}
        href={"/login?next=" + encodeURIComponent(next)}
      >
        Sign in to continue
      </Link>
    </section>
  ) : invoiceId ? (
    <CheckoutPanel invoiceId={invoiceId} />
  ) : checkout ? (
    user.role === "Member" ? (
      <PaymentResult
        checkout={checkout}
        detail={detail.data}
        checking={checking}
        error={error}
        onRefresh={() => setRefreshVersion((v) => v + 1)}
      />
    ) : (
      <CheckoutPanel invoiceId={checkout.invoiceId} />
    )
  ) : (
    <section className={styles.loading} aria-busy={checking}>
      <h2>
        {checking ? "Finding your checkout" : "We couldn't load your checkout"}
      </h2>
      <p role={error ? "alert" : "status"}>
        {error || "Retrieving the payment linked to your purchase."}
      </p>
      {!checking && (
        <div>
          <Button onClick={() => setRefreshVersion((v) => v + 1)}>
            Check again
          </Button>{" "}
          <Link
            className={buttonClass({ variant: "secondary" })}
            href="/member/finance?tab=invoices"
          >
            View invoices
          </Link>
        </div>
      )}
    </section>
  );
  return embedded ? body : <main className="refactor-public">{body}</main>;
}

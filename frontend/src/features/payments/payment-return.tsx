"use client";
import { useEffect, useState } from "react";
import { CheckoutPanel } from "./checkout-panel";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/apiClient";
import type { CheckoutDto } from "@/lib/types";
import Link from "next/link";
/** `invoiceId` có sẵn (route /checkout/[invoiceId]) thì dùng thẳng; không thì đọc từ query của /payments/return. */
export function PaymentReturn({ invoiceId }: { invoiceId?: string } = {}) {
  const { t } = useLanguage();
  const { user, loading } = useAuth();
  const [id, setId] = useState<string | null>(invoiceId ?? null);
  const [error, setError] = useState("");
  const [next, setNext] = useState("/payments/return");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const value = invoiceId ?? q.get("invoiceId");
    const reference = q.get("vnp_TxnRef");
    const controller = new AbortController();
    setTimeout(
      () => setNext(window.location.pathname + window.location.search),
      0,
    );
    if (
      value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    )
      setTimeout(() => setId(value), 0);
    else if (user && reference)
      api
        .get<CheckoutDto>("/api/checkouts/by-reference", {
          signal: controller.signal,
          query: { reference },
        })
        .then((c) => {
          if (!controller.signal.aborted) setId(c.invoiceId);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    return () => controller.abort();
  }, [user, invoiceId]);
  return (
    <>
      <main className="refactor-public">
        <h1>{t.checkout.title}</h1>
        {error && <p role="alert">{error}</p>}
        {loading ? (
          <p>{t.refactor.loading}</p>
        ) : !user ? (
          <Link href={`/login?next=${encodeURIComponent(next)}`}>
            {t.refactor.login}
          </Link>
        ) : id ? (
          <CheckoutPanel key={`${user.userId}-${id}`} invoiceId={id} />
        ) : (
          <p>{t.refactor.uncertain}</p>
        )}
      </main>
    </>
  );
}

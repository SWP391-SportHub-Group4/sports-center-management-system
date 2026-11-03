"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { paymentApi, type PurchaseIntent } from "./api";
import { paymentSupportErrorCodes } from "@/lib/payment-support-errors";

/** Create a resumable invoice, then open the shared checkout page. */
export function useStartCheckout() {
  const router = useRouter();
  const { t } = useLanguage();
  const keys = useRef(new Map<string, string>());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  async function start(id: string, intent: PurchaseIntent) {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    const key = keys.current.get(id) ?? crypto.randomUUID();
    keys.current.set(id, key);
    try {
      const checkout = await paymentApi.create(intent, key);
      keys.current.delete(id);
      router.push(`/checkout/${checkout.invoiceId}`);
    } catch (cause) {
      const message =
        cause instanceof ApiError &&
        cause.code === paymentSupportErrorCodes.dayPassOutsideHours
          ? "Gym day passes can be purchased only from 06:00 until 22:00 Vietnam time."
          : cause instanceof ApiError && cause.code === "duplicate_active_package"
          ? t.apiErrors.duplicateActivePackage
          : cause instanceof Error
            ? cause.message
            : t.apiErrors.generic;
      setError({ id, message });
      setBusyId(null);
    }
  }

  return { start, busyId, error };
}

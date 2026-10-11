"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/apiClient";
import { paymentApi, type PurchaseIntent } from "@/features/payments";
import { useLanguage } from "@/lib/language";

/**
 * Tạo hóa đơn cho gói đã chọn rồi chuyển sang trang thanh toán dùng chung `/checkout/[invoiceId]`.
 * Mỗi gói giữ một idempotency key riêng: bấm lại sau lỗi mạng sẽ nhận lại đúng hóa đơn, không tạo bản sao.
 */
export function useStartCheckout() {
  const router = useRouter();
  const { t } = useLanguage();
  const keys = useRef(new Map<string, string>());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(
    null,
  );

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
        cause instanceof ApiError && cause.code === "duplicate_active_package"
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

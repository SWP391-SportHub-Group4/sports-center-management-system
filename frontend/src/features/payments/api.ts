import { api } from "@/lib/apiClient";
import type { CheckoutDto, PaymentAttemptDto } from "@/lib/types";
export interface PurchaseIntent {
  kind: "membership" | "class" | "pt" | "court-rental";
  body: Record<string, unknown>;
}
export const paymentApi = {
  create: (intent: PurchaseIntent, key: string) =>
    api.post<CheckoutDto>(`/api/checkouts/${intent.kind}`, intent.body, {
      idempotencyKey: key,
    }),
  get: (invoiceId: string, signal?: AbortSignal) =>
    api.get<CheckoutDto>(`/api/checkouts/${invoiceId}`, { signal }),
  policy: (signal?: AbortSignal) =>
    api.get<{ holdMinutes: number }>("/api/checkouts/policy", { signal }),
  recover: (key: string) =>
    api.get<CheckoutDto>("/api/checkouts/by-key", { query: { key } }),
  attempt: (invoiceId: string) =>
    api.post<PaymentAttemptDto>(`/api/checkouts/${invoiceId}/attempts`),
  confirmPoints: (invoiceId: string) =>
    api.post<CheckoutDto>(`/api/checkouts/${invoiceId}/confirm-points`),
  cancel: (invoiceId: string) =>
    api.post<void>(`/api/checkouts/${invoiceId}/cancel`),
  retry: (invoiceId: string, key: string, priceVersion?: string) =>
    api.post<CheckoutDto>(
      `/api/checkouts/${invoiceId}/retry`,
      { priceVersion },
      { idempotencyKey: key },
    ),
  reconcile: (invoiceId: string) =>
    api.post<{ verified: boolean }>(`/api/invoices/${invoiceId}/reconcile`),
  refundQuote: (itemId: string, signal?: AbortSignal) =>
    api.get<{ systemCalculatedPoints: number }>(
      `/api/refunds/quote/${itemId}`,
      { signal },
    ),
  refund: (invoiceItemId: string, reason: string) =>
    api.post("/api/refunds", { invoiceItemId, reason }),
};

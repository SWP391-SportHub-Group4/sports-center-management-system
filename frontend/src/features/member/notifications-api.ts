import { api } from "@/lib/apiClient";

export interface NotificationDto {
  notificationId: string;
  sourceEventType: string;
  sourceEntityId: string | null;
  message: string;
  status: string;
  sentAt: string | null;
}

export const notificationsApi = {
  list: (unreadOnly: boolean, signal: AbortSignal) =>
    api.get<NotificationDto[]>("/api/notifications", {
      signal,
      query: { unreadOnly },
    }),
  read: (id: string) =>
    api.post(`/api/notifications/${encodeURIComponent(id)}/read`),
  readAll: () => api.post("/api/notifications/read-all"),
};

/** Only map known source identities. PaymentReceived also has legacy package IDs. */
export function memberNotificationHref(item: NotificationDto): string | null {
  if (item.sourceEventType === "CLASS_THRESHOLD_AT_RISK" && item.sourceEntityId)
    return `/member/threshold?responseId=${encodeURIComponent(item.sourceEntityId)}`;
  if (item.sourceEventType === "INVOICE_CREATED" && item.sourceEntityId)
    return `/member/invoices/${encodeURIComponent(item.sourceEntityId)}`;
  if (["PAYMENT_RECEIVED", "REFUND_COMPLETED"].includes(item.sourceEventType))
    return "/member/finance?tab=invoices";
  if (item.sourceEventType.startsWith("HOMEWORK")) return "/member/training";
  if (item.sourceEventType === "PACKAGE_EXPIRING") return "/member/services";
  if (
    ["SCHEDULE_CHANGED", "CLASS_CANCELLED", "INCIDENT_RESOLUTION"].includes(
      item.sourceEventType,
    )
  )
    return "/member/schedule";
  if (item.sourceEventType === "CLASS_PUBLISHED") return "/courses";
  return null;
}

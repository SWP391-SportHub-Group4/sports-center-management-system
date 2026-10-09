import { api } from "@/lib/apiClient";

export interface NotificationDto {
  notificationId: string;
  sourceEventType: string;
  sourceEntityId: string | null;
  message: string;
  status: string;
  sentAt: string | null;
  actionUrl?: string | null;
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
  if (item.actionUrl !== undefined)
    return item.actionUrl?.startsWith("/member/") ? item.actionUrl : null;
  if (item.sourceEventType === "CLASS_THRESHOLD_AT_RISK" && item.sourceEntityId)
    return `/member/threshold?responseId=${encodeURIComponent(item.sourceEntityId)}`;
  if (item.sourceEventType === "INVOICE_CREATED" && item.sourceEntityId)
    return `/member/invoices/${encodeURIComponent(item.sourceEntityId)}`;
  if (["PAYMENT_RECEIVED", "REFUND_COMPLETED"].includes(item.sourceEventType))
    return "/member/finance?tab=invoices";
  if (item.sourceEventType === "PACKAGE_EXPIRING") return "/member/services";
  if (
    ["SCHEDULE_CHANGED", "CLASS_CANCELLED", "INCIDENT_RESOLUTION"].includes(
      item.sourceEventType,
    )
  )
    return "/member/schedule";
  if (item.sourceEventType === "CLASS_PUBLISHED") return "/member/discover";
  return null;
}

export function notificationActionLabel(
  item: NotificationDto,
  language: string,
) {
  const vi = language === "vi";
  switch (item.sourceEventType) {
    case "INVOICE_CREATED":
      return vi ? "Xem và thanh toán hóa đơn" : "View and pay invoice";
    case "CLASS_THRESHOLD_AT_RISK":
      return vi
        ? "Chọn chuyển lớp hoặc hoàn điểm"
        : "Choose transfer or refund";
    case "SCHEDULE_CHANGED":
      if (item.actionUrl?.startsWith("/member/pt/sessions/"))
        return vi ? "Xem buổi PT và gửi yêu cầu" : "Review PT session";
      return vi ? "Xem lịch và xử lý thay đổi" : "Review schedule change";
    case "REFUND_COMPLETED":
      return vi ? "Kiểm tra hoàn điểm" : "Check refund";
    default:
      return vi ? "Mở để xử lý" : "Open to take action";
  }
}

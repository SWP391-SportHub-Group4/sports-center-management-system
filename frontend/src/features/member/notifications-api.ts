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
    return `/member/services?section=courses&view=owned&responseId=${encodeURIComponent(item.sourceEntityId)}`;
  if (item.sourceEventType === "INVOICE_CREATED" && item.sourceEntityId)
    return `/member/finance?tab=invoices&invoice=${encodeURIComponent(item.sourceEntityId)}`;
  if (["PAYMENT_RECEIVED", "REFUND_COMPLETED"].includes(item.sourceEventType))
    return "/member/finance?tab=invoices";
  if (item.sourceEventType === "PACKAGE_EXPIRING")
    return "/member/services?section=gym&view=owned";
  if (
    ["SCHEDULE_CHANGED", "CLASS_CANCELLED", "INCIDENT_RESOLUTION"].includes(
      item.sourceEventType,
    )
  )
    return "/member/schedule";
  if (item.sourceEventType === "CLASS_PUBLISHED") return "/member/services";
  return null;
}

export function notificationActionLabel(
  item: NotificationDto,
  language: string,
) {
  const vi = language === "vi";
  switch (item.sourceEventType) {
    case "CLASS_SESSION_CHANGE_REQUESTED":
      return vi ? "Xử lý yêu cầu đổi lịch" : "Review change request";
    case "CLASS_SESSION_CHANGE_REVIEWED":
      return vi ? "Xem kết quả yêu cầu" : "View request outcome";
    case "CLASS_TEACHING_UPDATED":
      return vi ? "Xem nội dung từ coach" : "View your coach’s update";
    case "INVOICE_CREATED":
      return vi ? "Xem và thanh toán hóa đơn" : "View and pay invoice";
    case "CLASS_THRESHOLD_AT_RISK":
      return vi
        ? "Chọn chuyển lớp hoặc hoàn điểm"
        : "Choose transfer or refund";
    case "SCHEDULE_CHANGED":
      return vi ? "Xem lịch và xử lý thay đổi" : "Review schedule change";
    case "REFUND_COMPLETED":
      return vi ? "Kiểm tra hoàn điểm" : "Check refund";
    default:
      return vi ? "Mở để xử lý" : "Open to take action";
  }
}

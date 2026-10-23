import { api } from "@/lib/apiClient";

export interface NotificationDto {
  notificationId: string;
  sourceEventType: string;
  sourceEntityId: string | null;
  message: string;
  status: string;
  sentAt: string | null;
  actionUrl?: string | null;
  title?: string | null;
  senderName?: string | null;
}

export interface NotificationInboxPage {
  items: NotificationDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export const notificationsApi = {
  inbox: (
    filters: { unreadOnly: boolean; search: string; page: number },
    signal: AbortSignal,
  ) =>
    api.get<NotificationInboxPage>("/api/notifications/inbox", {
      signal,
      query: { ...filters, pageSize: 25 },
    }),
  get: (id: string, signal: AbortSignal) =>
    api.get<NotificationDto>(`/api/notifications/${encodeURIComponent(id)}`, {
      signal,
    }),
  list: (unreadOnly: boolean, signal: AbortSignal) =>
    api.get<NotificationDto[]>("/api/notifications", {
      signal,
      query: { unreadOnly },
    }),
  read: (id: string) =>
    api.post(`/api/notifications/${encodeURIComponent(id)}/read`),
  readAll: () => api.post("/api/notifications/read-all"),
};

export function notificationInboxHref(item: NotificationDto): string {
  return `/notifications?message=${encodeURIComponent(item.notificationId)}`;
}

/** Related actions stay inside the recipient's own workspace. Reading never requires an action link. */
export function notificationActionHref(
  item: NotificationDto,
  role?: string,
): string | null {
  const roots: Record<string, string> = {
    Member: "/member/",
    Coach: "/coach/",
    Receptionist: "/receptionist/",
    CenterManager: "/manager/",
    SystemAdministrator: "/admin/",
  };
  const root = role ? roots[role] : null;
  const href =
    role === "Member" ? memberNotificationHref(item) : item.actionUrl;
  return root &&
    href?.startsWith(root) &&
    !href.includes("\\") &&
    !/\s/.test(href)
    ? href
    : null;
}

export type NotificationCategory =
  "schedule" | "class" | "payment" | "training" | "notice";

export function notificationPresentation(item: NotificationDto): {
  category: NotificationCategory;
  label: string;
  title: string;
} {
  const source = item.sourceEventType;
  let category: NotificationCategory = "notice";
  let label = "Center update";
  let title = "An update from SportHub";
  if (source === "SUPPORT_REQUEST_ASSIGNED") {
    label = "Member support";
    title = "A support request has been assigned to you";
  } else if (source === "COACH_ATTENDANCE_REMINDER") {
    category = "schedule";
    label = "Attendance";
    title = "Complete your session attendance";
  } else if (source === "AVATAR_REPORTED") {
    label = "Profile photo";
    title = "A profile photo needs review";
  } else if (source === "COACH_COVERAGE_REQUIRED") {
    label = "Coach assignments";
    title = "Coach assignments need review";
  } else if (/SCHEDULE|SESSION|CHANGE_REQUEST/.test(source)) {
    category = "schedule";
    label = "Schedule";
    title = /REMINDER/.test(source)
      ? "Your upcoming lesson"
      : /REQUESTED/.test(source)
        ? "A coach has requested an absence"
        : /REVIEWED/.test(source)
          ? "Your request has an update"
          : "Your schedule has changed";
  } else if (/INVOICE|PAYMENT|REFUND|POINT/.test(source)) {
    category = "payment";
    label = "Billing";
    title = /REFUND/.test(source)
      ? "Your refund update"
      : /PAYMENT/.test(source) && /^Top-up successful/.test(item.message)
        ? "Points added to your wallet"
        : /PAYMENT/.test(source)
          ? "Your payment update"
          : /INVOICE/.test(source)
            ? "Your invoice update"
            : "Your point wallet update";
  } else if (/TEACHING|HOMEWORK|ASSESSMENT|WORKOUT/.test(source)) {
    category = "training";
    label = "Training";
    title = "A training update from your coach";
  } else if (/CLASS|COURSE|ENROLLMENT/.test(source)) {
    category = "class";
    label = "Classes";
    title = /THRESHOLD/.test(source)
      ? "Your class needs a decision"
      : /CANCELLED/.test(source)
        ? "Your class has been cancelled"
        : "Your class update";
  } else if (/PACKAGE/.test(source)) {
    label = "Membership";
    title = "Your membership update";
  } else if (/INCIDENT/.test(source)) {
    label = "Center update";
    title = "An update about a center disruption";
  }
  return { category, label, title: item.title?.trim() || title };
}

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
    case "SUPPORT_REQUEST_ASSIGNED":
      return "View support request";
    case "COACH_ATTENDANCE_REMINDER":
      return "Complete attendance";
    case "AVATAR_REPORTED":
      return "Review avatar report";
    case "COACH_COVERAGE_REQUIRED":
      return "Review coach assignments";
    case "CLASS_SESSION_REMINDER":
      return "View upcoming session";
    case "CLASS_SESSION_CHANGE_REQUESTED":
      return vi ? "Xử lý yêu cầu đổi lịch" : "Review change request";
    case "CLASS_SESSION_CHANGE_REVIEWED":
      return vi ? "Xem kết quả yêu cầu" : "View request outcome";
    case "CLASS_TEACHING_UPDATED":
      return vi ? "Xem nội dung từ coach" : "View your coach’s update";
    case "INVOICE_CREATED":
      return vi ? "Xem và thanh toán hóa đơn" : "View and pay invoice";
    case "CLASS_THRESHOLD_AT_RISK":
      return item.actionUrl?.startsWith("/manager/")
        ? "Review class"
        : "Review class decision";
    case "CLASS_CANCELLED":
      return item.actionUrl?.includes("responseId=")
        ? "Choose refund or wait"
        : "View class";
    case "SCHEDULE_CHANGED":
      return vi ? "Xem lịch và xử lý thay đổi" : "Review schedule change";
    case "REFUND_COMPLETED":
      return vi ? "Kiểm tra hoàn điểm" : "Check refund";
    default:
      return vi ? "Mở để xử lý" : "Open to take action";
  }
}

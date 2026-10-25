/** Display copy only. Keep the original action code in URLs, API filters and stored events. */
const labels: Record<string, string> = {
  UPDATE_LANDING_PAGE: "Homepage content updated",
  UPLOAD_MEDIA_IMAGE: "Homepage image uploaded",
  CREATE_STAFF_ACCOUNT: "Staff account created",
  CHANGE_USER_ROLE: "Account role changed",
  LOCK_USER_ACCOUNT: "Account locked or deactivated",
  LOCK_USER: "Account locked",
  UNLOCK_USER_ACCOUNT: "Account unlocked",
  UNLOCK_USER: "Account unlocked",
  DEACTIVATE_USER_ACCOUNT: "Account deactivated",
  RESEND_STAFF_ACTIVATION: "Staff activation email queued again",
  CHANGE_PENDING_STAFF_EMAIL: "Unactivated staff account email corrected",
  FRONT_DESK_CREATE_MEMBER: "Member account created at the front desk",
  RESEND_MEMBER_ACTIVATION: "Member activation email queued again",
  CHANGE_PENDING_MEMBER_EMAIL: "Unactivated member account email corrected",
  EXPIRE_UNACTIVATED_STAFF_ACCOUNT: "Expired unactivated staff account removed",
  EXPIRE_UNACTIVATED_MEMBER_ACCOUNT:
    "Expired unactivated member account removed",
  UPDATE_COACH_SPECIALTIES: "Coach specialties updated",
  CREATE_CLASS: "Class created",
  UPDATE_CLASS: "Class details updated",
  PUBLISH_CLASS: "Class published for registration",
  CANCEL_CLASS: "Class cancelled",
  CANCEL_CLASS_BELOW_THRESHOLD:
    "Class cancelled due to insufficient enrollment",
  CLOSE_CLASS_ENROLLMENT: "Class registration closed",
  REOPEN_CLASS_ENROLLMENT: "Class registration reopened",
  CANCEL_CLASS_ENROLLMENT: "Student enrollment cancelled",
  UPDATE_CLASS_THRESHOLD_PRICING: "Class opening threshold and pricing updated",
  WAIVE_CLASS_THRESHOLD: "Minimum class enrollment requirement waived",
  RESPOND_CLASS_THRESHOLD: "Response to a class opening decision recorded",
  RESCHEDULE_CLASS_SESSION: "Class session rescheduled",
  CANCEL_CLASS_SESSION: "Class session cancelled",
  UNDO_CANCEL_CLASS_SESSION: "Class session cancellation reversed",
  UNDO_RESCHEDULE_CLASS_SESSION: "Class session rescheduling reversed",
  REASSIGN_LOCKED_MAIN_COACH: "Main Coach replaced after an account lock",
  CHANGE_CLASS_LEAD_COACH: "Class lead coach and future sessions updated",
  CREATE_CLASS_SESSION_CHANGE_REQUEST: "Session change request submitted",
  UPDATE_CLASS_SESSION_CHANGE_REQUEST: "Session change request updated",
  WITHDRAW_CLASS_SESSION_CHANGE_REQUEST: "Session change request cancelled",
  RESOLVE_CLASS_SESSION_CHANGE_REQUEST:
    "Session change request approved and handled",
  REJECT_CLASS_SESSION_CHANGE_REQUEST: "Session change request rejected",
  AUTO_CLOSE_CLASS_SESSION_CHANGE_REQUEST:
    "Pending Coach request closed after a schedule change",
  MARK_COURSE_ATTENDANCE: "Student attendance recorded",
  CORRECT_COURSE_ATTENDANCE: "Student attendance corrected",
  CREATE_CLASS_TEACHING: "Teaching record added",
  EDIT_CLASS_TEACHING: "Teaching record updated",
  CREATE_COACH_MEMBER_RELATIONSHIP: "Coach assigned to a member",
  END_COACH_MEMBER_RELATIONSHIP: "Coach assignment ended",
  AUTO_END_COACH_MEMBER_RELATIONSHIP: "Coach assignment ended automatically",
  CREATE_ROOM: "Court or room created",
  UPDATE_ROOM: "Court or room details updated",
  DELETE_ROOM: "Court or room deleted",
  CREATE_ROOM_TYPE: "Court or room type created",
  UPDATE_ROOM_TYPE: "Court or room type updated",
  DELETE_ROOM_TYPE: "Court or room type deleted",
  SET_ROOM_TYPE_SPORTS: "Sports for a court or room type updated",
  SET_ROOM_OPENING_HOURS: "Court or room opening hours updated",
  CREATE_ROOM_BLOCK: "Court or room availability blocked",
  DELETE_ROOM_BLOCK: "Court or room availability block removed",
  UNDO_DELETE_ROOM_BLOCK: "Court or room availability block restored",
  ENABLE_COURT_RENTAL: "Court rental enabled",
  CREATE_COURT_RATE: "Court rental rate created",
  UPDATE_COURT_RATE: "Court rental rate updated",
  DELETE_COURT_RATE: "Court rental rate deleted",
  CREATE_SPORT: "Sport added",
  UPDATE_SPORT: "Sport details updated",
  ACTIVATE_SPORT: "Sport activated",
  DEACTIVATE_SPORT: "Sport deactivated",
  ENABLE_SPORT_SERVICE: "Sport service enabled",
  DISABLE_SPORT_SERVICE: "Sport service disabled",
  CREATE_MEMBERSHIP_PACKAGE: "Membership plan created",
  UPDATE_MEMBERSHIP_PACKAGE: "Membership plan updated",
  UPDATE_PACKAGE_STATUS: "Membership plan availability changed",
  ACTIVATE_MEMBER_PACKAGE: "Member's membership activated",
  CANCEL_MEMBERSHIP: "Membership cancelled",
  CANCEL_MEMBERSHIP_FOR_REFUND: "Membership cancelled for a points refund",
  CREATE_CLASS_CHECKOUT: "Class registration checkout created",
  CREATE_COURT_RENTAL_CHECKOUT: "Court booking checkout created",
  ISSUE_PACKAGE_INVOICE: "Membership invoice issued",
  FULFILL_CHECKOUT: "Purchased service activated",
  RELEASE_CHECKOUT: "Checkout reservation released",
  FRONT_DESK_PAYMENT_RECONCILIATION_RETRY:
    "Payment reconciliation retried at the front desk",
  COMPENSATE_GATEWAY_PAYMENT: "Gateway payment compensation processed",
  MANUAL_GATEWAY_COMPENSATION_REQUIRED:
    "Gateway payment requires manual compensation",
  REQUEST_POINT_REFUND: "Points refund requested",
  APPROVE_POINT_REFUND: "Points refund approved",
  REJECT_POINT_REFUND: "Points refund rejected",
  REQUEST_POINT_CREDIT: "Points credit requested",
  APPROVE_POINT_CREDIT: "Points credit approved",
  REJECT_POINT_CREDIT: "Points credit rejected",
  ADJUST_POINTS: "Member's points balance adjusted",
  REQUEST_POINT_CONFIRMATION: "Member's approval to use points requested",
  CONFIRM_POINT_SELECTION: "Points payment confirmed",
  SELECT_SELF_POINTS: "Points selected for payment",
  CLEAR_COUNTER_POINTS: "Points removed from the front-desk payment",
  VIEW_MEMBER_POINT_SELECTION: "Member's points payment details viewed",
  VIEW_MEMBER_WALLET: "Member's points wallet viewed",
  CREATE_SUPPORT_REQUEST: "Member support request created",
  ASSIGN_SUPPORT_REQUEST: "Member support request assigned",
  UPDATE_SUPPORT_PROGRESS: "Member support progress updated",
  CLOSE_SUPPORT_REQUEST: "Member support request closed",
  COMPLETE_SUPPORT_REQUEST: "Support request marked as done",
  REJECT_SUPPORT_REQUEST: "Support request rejected",
  REMIND_SUPPORT_REQUEST: "Support request reminder sent",
  PAYMENT_NOT_ACTIVATED: "Payment received but service not activated",
  SUPPORT_PAYOUT_RECORDED: "Bank refund recorded",
  SUPPORT_PAYOUT_CONFIRMED: "Member confirmed receiving the refund",
  SUPPORT_PAYOUT_NOT_RECEIVED:
    "Member reported that the refund was not received",
  SUPPORT_PAYOUT_AUTO_CONFIRMED: "Refund receipt automatically confirmed",
  CONVERT_UNACTIVATED_PAYMENT_TO_POINTS:
    "Unactivated payment converted to wallet points",
  SEND_MANUAL_NOTICE: "Center announcement queued",
  RECORD_SESSION_INCIDENT: "Class session incident recorded",
  RESOLVE_CENTER_INCIDENT: "Center incident handled",
  OPEN_INCIDENT_FENCE: "Incident recovery started",
  EXTEND_INCIDENT_FENCE: "Incident recovery period extended",
  RELEASE_INCIDENT_FENCE: "Incident recovery completed",
  ABANDON_INCIDENT_FENCE: "Incident recovery stopped",
  RESOLVE_FORGOTTEN_GYM_CHECKOUT: "Missing Gym checkout resolved",
  UPDATE_AVATAR: "Profile photo updated",
  UPLOAD_COACH_CREDENTIAL: "Coach certificate or award added",
  UPDATE_COACH_CREDENTIAL: "Coach certificate or award updated",
  DELETE_COACH_CREDENTIAL: "Coach certificate or award removed",
  DELETE_AVATAR: "Profile photo removed",
  IMPORT_GOOGLE_AVATAR: "Google profile photo imported",
  REPORT_AVATAR: "Profile photo reported",
  DISMISS_AVATAR_REPORT: "Profile photo report dismissed",
  MANAGER_REMOVE_MEMBER_AVATAR: "Profile photo removed by staff",
  CREATE_REPORT_EXPORT: "Report export requested",
  DELETE_REPORT_EXPORT: "Exported report deleted",
  UPDATE_SYSTEM_SETTING: "Center setting updated",
};

const pastTense: Record<string, string> = {
  CREATE: "created",
  UPDATE: "updated",
  EDIT: "updated",
  DELETE: "deleted",
  REMOVE: "removed",
  ADD: "added",
  APPROVE: "approved",
  REJECT: "rejected",
  CANCEL: "cancelled",
  WITHDRAW: "cancelled",
  RESOLVE: "handled",
  CHANGE: "changed",
  ASSIGN: "assigned",
  REASSIGN: "reassigned",
  PUBLISH: "published",
  ACTIVATE: "activated",
  DEACTIVATE: "deactivated",
  ENABLE: "enabled",
  DISABLE: "disabled",
  CLOSE: "closed",
  REOPEN: "reopened",
  RECORD: "recorded",
  MARK: "recorded",
  CORRECT: "corrected",
  VIEW: "viewed",
  REQUEST: "requested",
  END: "ended",
  TRANSFER: "transferred",
  RESTORE: "restored",
};

export function auditActionLabel(
  action: string,
  newValue?: string | null,
): string {
  const code = action.trim().toUpperCase();
  if (code === "LOCK_USER_ACCOUNT" && newValue) {
    try {
      const payload: unknown = JSON.parse(newValue);
      if (
        payload &&
        typeof payload === "object" &&
        "status" in payload &&
        typeof payload.status === "string"
      ) {
        const status = payload.status.toUpperCase();
        if (status === "DEACTIVATED") return "Account deactivated";
        if (status === "BANNED" || status === "LOCKED") return "Account locked";
      }
    } catch {
      /* Older events may not contain a JSON snapshot. */
    }
  }
  if (labels[code]) return labels[code];
  // New or historical action codes remain understandable without requiring a deployment of the catalogue.
  const [verb, ...subject] = code.split("_");
  const words = subject.join(" ").toLowerCase();
  const text =
    pastTense[verb] && words
      ? `${words} ${pastTense[verb]}`
      : action
          .replace(/([a-z\d])([A-Z])/g, "$1 $2")
          .replace(/[_-]+/g, " ")
          .toLowerCase();
  return text
    ? text.charAt(0).toUpperCase() + text.slice(1)
    : "Activity recorded";
}

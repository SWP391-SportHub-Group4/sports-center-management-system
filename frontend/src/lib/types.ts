export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export type SportServiceType =
  "MEMBERSHIP_ACCESS" | "GROUP_COURSE" | "COURT_RENTAL" | "PERSONAL_TRAINING";

export interface SportServiceDto {
  /** Server-owned ID, returned only by the Manager catalog for service qualification mapping. */
  offeringId?: number;
  serviceType: SportServiceType;
  isEnabled: boolean;
  /** Chỉ có với GROUP_COURSE. */
  defaultSessionMinutes: number | null;
  defaultMaxCapacity: number | null;
}

/** Phần còn thiếu để dịch vụ bán được; chỉ Manager nhận (api/manager/sports). */
export interface ServiceReadinessDto {
  serviceType: SportServiceType;
  ready: boolean;
  missing: ("room_type" | "room" | "opening_hours" | "court_rate")[];
}

export interface SportDto {
  sportId: number;
  /** Mã ổn định, không đổi sau khi tạo. */
  code: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  services: SportServiceDto[];
  readiness?: ServiceReadinessDto[] | null;
}

export interface CourseDto {
  classId: number;
  code: string;
  name: string;
  sportId: number;
  sportName: string;
  coachId: string | null;
  coachName: string | null;
  defaultRoomId: number;
  roomName: string;
  startDate: string;
  numSessions: number;
  capacity: number;
  availableSeats: number;
  price: number;
  status: "PUBLISHED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  firstSessionStartUtc: string | null;
  scheduleRules: { dayOfWeek: number; startTimeLocal: string }[];
}

export interface CourseEnrollmentDto {
  invoiceItemId: string | null;
  enrollmentId: string;
  classId: number;
  classCode: string;
  className: string;
  sportName: string;
  memberId: string;
  status:
    | "CONFIRMED"
    | "TRANSFERRED_OUT"
    | "REFUNDED"
    | "CANCELLED_BY_CENTER"
    | "CANCELLED";
  enrolledAt: string;
  endedAt: string | null;
  numSessions: number;
  firstSessionStartUtc: string | null;
  classStatus: string;
  coachName?: string | null;
  roomName?: string | null;
  lastSessionEndUtc?: string | null;
  /** Số buổi đã diễn ra (không tính buổi hủy). */
  completedSessions?: number;
  nextSessionStartUtc?: string | null;
  sportId?: number;
}

export interface WalletBalanceDto {
  ownerUserId: string;
  availablePoints: number;
  heldPoints: number;
  vndPerPoint: number;
}

export interface WalletLedgerDto {
  id: string;
  entryType: "EARN" | "HOLD" | "RELEASE" | "SPEND" | "ADJUSTMENT";
  points: number;
  availableDelta: number;
  heldDelta: number;
  availableAfter: number;
  heldAfter: number;
  referenceType: string;
  referenceId: string;
  note: string | null;
  createdAtUtc: string;
}

export interface CheckoutDto {
  beneficiaryUserId: string;
  initiatorUserId: string;
  serverNowUtc: string;
  ptMemberPackageId: string | null;
  ptCoachId: string | null;
  ptFrequency: number | null;
  invoiceId: string;
  checkoutSessionId: string;
  revision: number;
  kind: "MEMBERSHIP" | "CLASS" | "PT" | "COURT_RENTAL";
  state: string;
  totalAmount: number;
  pointsApplied: number;
  cashAmount: number;
  expiresAtUtc: string;
  resourceHoldId: string | null;
  invoiceStatus: "ISSUED" | "PAID" | "VOID" | "PAID_AFTER_RECONCILIATION";
  fulfillmentOutcome:
    "PENDING" | "FULFILLED" | "COMPENSATED" | "RECONCILIATION_REQUIRED";
  reconciliationRequired: boolean;
}

export interface PaymentAttemptDto {
  gatewayMode: "MOCK" | "VNPAY";
  paymentAttemptId: string;
  invoiceId: string;
  transactionReference: string;
  cashAmount: number;
  pointsApplied: number;
  expiresAtUtc: string;
  paymentUrl: string | null;
  state: string;
}

export interface RoomDto {
  roomTypeId: number | null;
  isActive: boolean;
  roomId: number;
  name: string;
  capacity: number;
  activeClassCount: number;
}

export interface ClassRecurrenceDto {
  recurrenceId: number;
  daysOfWeek: string;
  startTimeLocal: string;
  endTimeLocal: string;
  timezone: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ClassDto {
  classId: number;
  name: string;
  discipline: string;
  defaultRoomId: number;
  defaultRoomName: string;
  roomCapacity: number;
  defaultCoachId: string | null;
  defaultCoachName: string | null;
  capacity: number;
  status: string;
  recurrences: ClassRecurrenceDto[];
}

export interface ClassSessionDto {
  sessionId: string;
  classId: number;
  className: string;
  discipline: string;
  roomId: number;
  roomName: string;
  coachId: string;
  coachName: string;
  startAtUtc: string;
  endAtUtc: string;
  capacity: number;
  baselineCapacity: number;
  confirmedCount: number;
  status: string;
  rescheduledFromSessionId: string | null;
  isFull: boolean;
}

export interface MemberSessionDto {
  session: ClassSessionDto;
  myEnrollmentId: string | null;
  myEnrollmentStatus: string | null;
}

export interface EnrollmentDto {
  enrollmentId: string;
  sessionId: string;
  memberId: string;
  memberEmail: string;
  memberName: string;
  memberPackageId: string;
  status: string;
  registeredAt: string;
  cancelledAt: string | null;
  cancellationDeadlineHours: number;
  cancellationDeadlineUtc: string;
  attendanceStatus: string | null;
  session: ClassSessionDto;
}

export interface RosterEntryDto {
  enrollmentId: string;
  memberId: string;
  memberEmail: string;
  memberName: string;
  enrollmentStatus: string;
  attendanceStatus: string | null;
  checkInTime: string | null;
}

export interface SessionRosterDto {
  session: ClassSessionDto;
  entries: RosterEntryDto[];
}

export interface MembershipPackageDto {
  packageId: number;
  name: string;
  price: number;
  durationDays: number;
  sessionLimit: number | null;
  description: string | null;
  /** Optional publisher metadata; legacy API responses omit these fields. */
  nameLanguage?: string | null;
  descriptionLanguage?: string | null;
  isActive: boolean;
}

export interface MemberPackageDto {
  memberPackageId: string;
  memberId: string;
  memberEmail: string;
  memberName: string;
  packageId: number;
  packageName: string;
  startDate: string;
  endDate: string;
  remainingSessions: number | null;
  sessionLimit: number | null;
  status: string;
  isUsable: boolean;
  stackingApproved: boolean;
  stackingApprovalReason: string | null;
}

export interface InvoiceSummaryDto {
  invoiceId: string;
  checkoutExpiresAtUtc?: string | null;
  invoiceNumber: string;
  memberId: string;
  memberEmail: string;
  memberName: string;
  totalAmount: number;
  pointsSpent: number;
  cashAmount: number;
  fulfillmentOutcome: string;
  reconciliationRequired: boolean;
  grossCollected: number;
  obligationReduction: number;
  refundedAmount: number;
  netCollected: number;
  netPayable: number;
  outstanding: number;
  refundDue: number;
  status: string;
  issuedAt: string;
}

export interface InvoiceItemDto {
  classId: number | null;
  courtRentalId: string | null;
  ptEntitlementId: string | null;
  memberPackageId: string | null;
  sportId: number | null;
  sportName: string | null;
  ptFrequencyPerWeek: number | null;
  sourceInvoiceItemId: string | null;
  itemId: string;
  itemType: string;
  description: string;
  unitPrice: number;
  quantity: number;
  lineAmount: number;
  relatedEntityId: string | null;
}

export interface PaymentDto {
  paymentId: string;
  amount: number;
  method: string;
  status: string;
  referenceCode: string | null;
  receivedByUserId: string;
  receivedByName: string;
  paidAt: string;
}

export interface PaymentAdjustmentDto {
  pointLedgerEntryId: string | null;
  centerFault: boolean;
  invoiceItemId: string | null;
  systemCalculatedPoints: number;
  approvedPoints: number | null;
  adjustmentId: string;
  invoiceId: string;
  invoiceNumber: string;
  paymentId: string | null;
  type: string;
  amount: number;
  requestedAmount: number;
  reason: string;
  status: string;
  requestedByUserId: string;
  requestedByName: string;
  approvedByUserId: string | null;
  approvedByName: string | null;
  completedByUserId: string | null;
  completedByName: string | null;
  refundMethod: string | null;
  refundReferenceCode: string | null;
  createdAt: string;
  approvedAtUtc: string | null;
  completedAtUtc: string | null;
  awaitingPayout: boolean;
  resolvedAt: string | null;
}

export interface InvoiceDetailDto {
  summary: InvoiceSummaryDto;
  memberPackageId: string | null;
  items: InvoiceItemDto[];
  payments: PaymentDto[];
  adjustments: PaymentAdjustmentDto[];
  suggestedRefundAmount: number;
}

export interface RevenueReportDto {
  legacyCashCollected: number;
  reconciliationCashCollected: number;
  reconciliationCashCount: number;
  pointsRedeemed: number;
  pointsRedeemedVnd: number;
  pointsIssued: number;
  managerPointAdjustment: number;
  outstandingPoints: number;
  bySource: { source: string; cashCollected: number; pointsRedeemed: number }[];
  bySportAndSource: {
    source: string;
    sportId: number | null;
    sportName: string | null;
    memberId: string | null;
    cashCollected: number;
    legacyCashCollected: number;
    pointsRedeemed: number;
  }[];
  fromDate: string;
  toDate: string;
  totalCollected: number;
  totalRefunded: number;
  totalObligationReduction: number;
  netRevenue: number;
  invoiceCount: number;
  paymentCount: number;
  refundCount: number;
  daily: {
    date: string;
    collected: number;
    refunded: number;
    obligationReduction: number;
    net: number;
  }[];
}

export interface UserAdminDto {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  status: string;
  createdAt: string;
  hasPassword: boolean;
  hasGoogleLink: boolean;
  sportIds: number[];
}

export type MyAccountDto = UserAdminDto;

export interface MemberTrainingProfileDto {
  memberId: string;
  goal: string;
  experienceLevel: string;
  notes: string | null;
  updatedAt: string;
}

export interface CoachMemberRelationshipDto {
  relationshipId: string;
  coachId: string;
  coachName: string;
  memberId: string;
  memberEmail: string;
  memberName: string;
  sourceType: string;
  classId: number | null;
  className: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
}

export interface WorkoutPlanDto {
  status: string;
  updatedAt: string;
  version: number;
  planId: string;
  memberId: string;
  memberName: string;
  coachId: string;
  coachName: string;
  relationshipId: string;
  goal: string;
  level: string;
  createdAt: string;
  items: {
    itemId: string;
    exercise: string;
    sets: number;
    reps: number;
    notes: string | null;
  }[];
}

export interface WorkoutResultDto {
  resultId: string;
  ptSessionId: string;
  sessionStartAtUtc: string;
  memberId: string;
  memberName: string;
  coachId: string;
  coachName: string;
  progressNote: string | null;
  coachComment: string | null;
  recordedAt: string;
}

export interface WorkoutSuggestionDto {
  memberId: string;
  memberName: string;
  goal: string;
  level: string;
  input: {
    historyWindowDays: number;
    sessionsAttended: number;
    sessionsMissed: number;
    gymCheckIns: number;
    recentDisciplines: string[];
    recentCoachNotes: string[];
  };
  exercises: string[];
  rationale: string;
  responseTimeMs: number;
  generatedAt: string;
}

export interface SystemSettingDto {
  key: string;
  value: string;
  description: string;
  updatedAt: string;
}

export interface AuditLogDto {
  auditId: string;
  userId: string;
  actorEmail: string;
  action: string;
  targetEntity: string;
  targetId: string;
  /** Current target identity; not an immutable snapshot of the audit event. */
  targetFullName?: string | null;
  targetEmail?: string | null;
  /** Null/absent for non-account targets or an older API. */
  targetAccountExists?: boolean | null;
  /** Display-only current label; never a historical snapshot. */
  currentTargetLabel?: string | null;
  /** Current names for references in this event, keyed as Entity:ID. */
  referenceNames?: Record<string, string> | null;
  oldValue: string | null;
  newValue: string | null;
  ipAddress: string;
  timestamp: string;
}

export interface ReportExportDto {
  reportExportId: string;
  reportType: string;
  requestedByUserId: string;
  requestedByName: string;
  parametersJson: string;
  status: string;
  rowCount: number;
  sizeBytes: number;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
  format: string;
}

export interface GymCheckInDto {
  checkOutTime: string | null;
  checkedOutByUserId: string | null;
  checkInId: string;
  memberId: string;
  checkedInByUserId: string;
  checkInTime: string;
}

export interface CourseMemberSessionDto {
  sessionId: string;
  classId: number;
  className: string;
  sportName: string;
  sessionNo: number;
  roomName: string;
  coachName?: string | null;
  startAtUtc: string;
  endAtUtc: string;
  status: string;
  isMakeup: boolean;
  attendanceStatus: string | null;
}

export interface RoomTypeDto {
  roomTypeId: number;
  name: string;
  sportIds: number[];
}
export interface OpeningHourDto {
  dayOfWeek: number;
  openTimeLocal: string;
  closeTimeLocal: string;
}
export interface CourtRateDto {
  rateId: number;
  roomTypeId: number;
  sportId: number | null;
  daysOfWeek: string;
  startTimeLocal: string;
  endTimeLocal: string;
  pricePerHour: number;
  isActive: boolean;
}
export interface RoomBlockDto {
  blockId: string;
  roomId: number;
  startAtUtc: string;
  endAtUtc: string;
  reason: string;
  incidentId: string | null;
  createdByUserId: string;
}
export interface CoachSpecialtyDto {
  userId: string;
  fullName: string;
  sportIds: number[];
}
export interface CourseSessionDto {
  sessionId: string;
  classId: number;
  className: string;
  sessionNo: number;
  roomId: number;
  roomName: string;
  coachId: string;
  coachName: string;
  startAtUtc: string;
  endAtUtc: string;
  status: string;
  isMakeup: boolean;
  rescheduledFromSessionId: string | null;
}
export interface PointConfirmationDto {
  confirmationId: string;
  invoiceId: string;
  memberId: string;
  points: number;
  expiresAtUtc: string;
  holdExpiresAtUtc: string;
  status: string;
  revision: number;
}
export interface PtEntitlementDto {
  entitlementId: string;
  memberId: string;
  memberName: string;
  coachId: string;
  coachName: string;
  frequencyPerWeek: number;
  totalQuota: number;
  reservedSessions: number;
  consumedSessions: number;
  remainingQuota: number;
  validityStartDate: string;
  validityEndDate: string;
  carryOverUntilDate: string | null;
  status: string;
}
export interface PtSessionDto {
  sessionId: string;
  entitlementId: string;
  memberId: string;
  memberName: string;
  coachId: string;
  coachName: string;
  startAtUtc: string;
  endAtUtc: string;
  status: string;
  quotaState: string;
  rescheduledFromSessionId: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  roomId: number | null;
  roomName: string | null;
}

/** Khung PT trống của Coach được giao (Member tự đặt lịch). */
export interface PtAvailabilityDto {
  entitlementId: string;
  coachId: string;
  coachName: string;
  sessionMinutes: number;
  remainingQuota: number;
  /** Null khi đặt được; ngược lại là mã lý do ổn định. */
  bookableReason: string | null;
  policy: {
    minLeadHours: number;
    advanceDays: number;
    stepMinutes: number;
    changeDeadlineHours: number;
  };
  slots: {
    startAtUtc: string;
    endAtUtc: string;
    rooms: { roomId: number; name: string }[];
  }[];
}

export interface PtChangeRequestDto {
  requestId: string;
  sessionId?: string;
  requestType?: string;
  status: string;
  reason: string | null;
  reviewNote: string | null;
  timingClassification?: string;
  requestedStartAtUtc?: string | null;
  requestedCoachName?: string;
}
export interface RevenueDimensionsDto {
  fromDate: string;
  toDate: string;
  cashCollected: number;
  pointsRedeemedVnd: number;
  rows: RevenueReportDto["bySportAndSource"];
}
export interface ClassEnrollmentReportDto {
  fromDate: string;
  toDate: string;
  totalClasses: number;
  totalCapacity: number;
  totalConfirmed: number;
  totalActiveHolds: number;
  fillRatio: number;
  classes: {
    classId: number;
    code: string;
    name: string;
    sportId: number;
    sportName: string;
    status: string;
    capacity: number;
    confirmedCount: number;
    activeHoldCount: number;
    availableSeats: number;
    fillRatio: number;
    breakEvenThreshold: number | null;
    thresholdStatus: string;
    firstSessionStartUtc: string | null;
  }[];
}
export interface PtReviewRequestDto extends PtChangeRequestDto {
  memberId: string;
  memberName?: string;
  entitlementId?: string;
  sessionStartAtUtc?: string;
  currentCoachName?: string;
  requestsException?: boolean;
}
export interface ProgressItemDto {
  ptSessionId: string;
  startAtUtc: string;
  endAtUtc: string;
  sessionStatus: string;
  memberId: string;
  memberName: string;
  coachName: string;
  resultId: string | null;
  progressNote: string | null;
  coachComment: string | null;
  recordedAt: string | null;
}
export interface ThresholdResponseDto {
  responseId: string;
  classId: number;
  className: string;
  sportId: number;
  paidValueVnd: number;
  deadlineUtc: string;
  choice: "REFUND" | "TRANSFER" | null;
  targetClassId: number | null;
  resolutionStatus: string;
  additionalInvoiceId: string | null;
  serverNowUtc: string;
}

export interface CourtRentalDto {
  courtRentalId: string;
  sportId: number;
  roomId: number;
  startAtUtc: string;
  endAtUtc: string;
  totalPrice: number;
  status: "PENDING_PAYMENT" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  invoiceItemId: string | null;
  invoiceId?: string | null;
}
export interface CourtRentalQuoteDto {
  totalPrice: number;
  blocks: { startUtc: string; endUtc: string; price: number }[];
}
export interface CourtRentalPolicyDto {
  slotMinutes: number;
  maxHours: number;
  advanceDays: number;
  cancelFreeHours: number;
  serverNowUtc: string;
}
export interface CourtRentalDetailDto {
  rental: CourtRentalDto;
  roomName: string;
  sportName: string;
  blocks: CourtRentalQuoteDto["blocks"];
  cancelReason: string | null;
  cancelledAtUtc: string | null;
  refundPoints: number;
}

export interface ManagerCourseDto extends Omit<CourseDto, "status"> {
  status: "DRAFT" | CourseDto["status"];
  costAmount: number;
  breakEvenThreshold: number | null;
  thresholdStatus: string;
  thresholdDeadlineUtc: string | null;
  confirmedCount: number;
  reservedCount: number;
  activeHoldCount: number;
  version: number;
  createdAt: string;
  publishedAt: string | null;
}
export interface CourseRosterDto {
  session: CourseSessionDto;
  attendanceOpensAtUtc: string;
  attendanceClosesAtUtc: string;
  entries: {
    enrollmentId: string;
    memberId: string;
    memberName: string;
    enrollmentStatus: string;
    attendanceStatus: string | null;
    attendanceRecordedAt: string | null;
  }[];
}
export interface CoachAdminDto {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  bio: string | null;
  sportIds: number[];
  createdAt: string;
}
export interface CourtScheduleEntryDto {
  sourceType: "CLASS_SESSION" | "PT_SESSION" | "COURT_RENTAL" | "ROOM_BLOCK";
  sourceId: string;
  roomId: number | null;
  startAtUtc: string;
  endAtUtc: string;
  coachId: string | null;
  coachName: string | null;
  title: string;
  status: string;
  classId: number | null;
  /** Người thuê (chỉ với COURT_RENTAL). */
  memberId?: string | null;
  memberName?: string | null;
  participants: {
    memberId: string;
    memberName: string;
    enrollmentId: string | null;
    attendanceStatus: string | null;
    recordedAtUtc: string | null;
  }[];
}
export interface RentalAvailabilityDto extends CourtRentalQuoteDto {
  roomId: number;
  name: string;
  capacity: number;
}
export interface IncidentPreviewDto {
  scope: string;
  roomId: number | null;
  startAtUtc: string;
  endAtUtc: string;
  canResolve: boolean;
  blockReason: string | null;
  impacts: {
    sourceType: string;
    sourceId: string;
    startAtUtc: string;
    endAtUtc: string;
    resolutionOptions: { action: string; method: string; path: string }[];
  }[];
}

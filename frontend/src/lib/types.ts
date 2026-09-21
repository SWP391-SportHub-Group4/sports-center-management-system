/** Hình dạng DTO trả về từ API (camelCase — Program.cs đặt JsonNamingPolicy.CamelCase). */

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface RoomDto {
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
  invoiceNumber: string;
  memberId: string;
  memberEmail: string;
  memberName: string;
  totalAmount: number;
  collectedAmount: number;
  adjustmentAmount: number;
  netPayable: number;
  outstanding: number;
  refundedAmount: number;
  status: string;
  issuedAt: string;
  dueDateUtc: string;
  firstDepositAtUtc: string | null;
  isOverdue: boolean;
}

export interface InvoiceItemDto {
  itemId: string;
  description: string;
  amount: number;
  relatedEntityType: string;
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
  adjustmentId: string;
  invoiceId: string;
  invoiceNumber: string;
  paymentId: string | null;
  type: string;
  amount: number;
  reason: string;
  status: string;
  requestedByUserId: string;
  requestedByName: string;
  approvedByUserId: string | null;
  approvedByName: string | null;
  createdAt: string;
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
  fromDate: string;
  toDate: string;
  totalCollected: number;
  totalAdjusted: number;
  netRevenue: number;
  invoiceCount: number;
  paymentCount: number;
  daily: { date: string; collected: number; adjusted: number; net: number }[];
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
}

/** Hồ sơ của chính người đang đăng nhập — cùng hình dạng với bản ghi quản trị. */
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
  planId: string;
  memberId: string;
  memberName: string;
  coachId: string;
  coachName: string;
  relationshipId: string;
  goal: string;
  level: string;
  createdAt: string;
  items: { itemId: string; exercise: string; sets: number; reps: number; notes: string | null }[];
}

export interface WorkoutResultDto {
  resultId: string;
  enrollmentId: string;
  sessionId: string;
  className: string;
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
}

export interface GymCheckInDto {
  checkInId: string;
  memberId: string;
  checkedInByUserId: string;
  checkInTime: string;
}

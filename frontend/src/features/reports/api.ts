import { api } from "@/lib/apiClient";
import type {
  RevenueReportDto,
  RevenueDimensionsDto,
  ClassEnrollmentReportDto,
  Paged,
  ReportExportDto,
  ManagerCourseDto,
} from "@/lib/types";
export interface ReportFilters {
  fromDate: string;
  toDate: string;
  sportId: string;
  source: string;
  memberId: string;
}
export interface RecordedAttendanceReport {
  fromDate: string;
  toDate: string;
  daily: {
    date: string;
    uniqueMembers: number;
    gymCheckIns: number;
    classAttendances: number;
  }[];
}
export interface CourtBookingReport {
  fromDate: string;
  toDate: string;
  totalBookings: number;
  totalBookedHours: number;
  daily?: { date: string; bookings: number; bookedHours: number }[];
  bySport: {
    sportId: number;
    sportName: string;
    bookings: number;
    bookedHours: number;
  }[];
}
export interface ClassStatusReport {
  open: number;
  completed: number;
  unpublished: number;
  classes?: {
    classId: number;
    name: string;
    sportId: number;
    sportName: string;
    startDate: string;
    status: string;
    capacity: number;
    confirmedCount: number;
    thresholdStatus: string;
  }[];
}
export interface ReconciliationCheck {
  name: string;
  reported: number;
  actual: number;
  delta: number;
  ok: boolean;
}
export interface ReportReconciliation {
  fromDate: string;
  toDate: string;
  generatedAtUtc: string;
  ok: boolean;
  durationMs: number;
  checks: ReconciliationCheck[];
  paidInvoicesChecked: number;
  invoiceMismatchCount: number;
  invoiceMismatches: {
    invoiceId: string;
    invoiceNumber: string;
    totalAmount: number;
    cashAmount: number;
    pointsApplied: number;
    paymentsTotal: number;
  }[];
}
export interface OperationsHealth {
  status: "Healthy" | "Degraded" | "Unhealthy";
  generatedAtUtc: string;
  jobHistorySinceUtc: string;
  jobs: {
    name: string;
    intervalSeconds: number;
    lastSuccessUtc: string | null;
    lastFailureUtc: string | null;
    lastError: string | null;
    consecutiveFailures: number;
    unhealthy: boolean;
  }[];
  outbox: {
    pending: number;
    stuckSending: number;
    failed: number;
    failedNeedingAttention: number;
  };
  payments: {
    gatewayEventsUnprocessed: number;
    gatewayEventsFailed: number;
    manualCompensationRequired: number;
    attemptsAwaitingReconciliation: number;
    invoicesFlaggedForReconciliation: number;
    expiredSeatHoldsNotReleased: number;
  };
}

export const reportsApi = {
  membershipSummary: (asOfDate: string, signal?: AbortSignal) =>
    api.get<{
      asOfDate: string;
      membersWithActiveMembership: number;
    }>("/api/reports/membership-summary", {
      signal,
      query: { asOfDate },
    }),
  classStatus: (signal?: AbortSignal, f?: ReportFilters) =>
    api.get<ClassStatusReport>("/api/reports/class-status", {
      signal,
      query: f
        ? {
            fromDate: f.fromDate,
            toDate: f.toDate,
            sportId: f.sportId || undefined,
          }
        : undefined,
    }),
  courtBookings: (f: ReportFilters, signal?: AbortSignal) =>
    api.get<CourtBookingReport>("/api/reports/court-bookings", {
      signal,
      query: {
        fromDate: f.fromDate,
        toDate: f.toDate,
        sportId: f.sportId || undefined,
        memberId: f.memberId || undefined,
      },
    }),
  attendance: (f: ReportFilters, signal?: AbortSignal) =>
    api.get<RecordedAttendanceReport>("/api/reports/recorded-attendance", {
      signal,
      query: { fromDate: f.fromDate, toDate: f.toDate },
    }),
  classesNeedingReview: (signal?: AbortSignal) =>
    api.get<Paged<ManagerCourseDto>>("/api/manager/classes", {
      signal,
      query: {
        status: "PUBLISHED",
        thresholdStatus: "AT_RISK",
        page: 1,
        pageSize: 1,
      },
    }),
  reconciliation: (f: ReportFilters) =>
    api.get<ReportReconciliation>("/api/reports/revenue/reconciliation", {
      query: { fromDate: f.fromDate, toDate: f.toDate },
    }),
  health: (signal?: AbortSignal) =>
    api.get<OperationsHealth>("/api/manager/operations/health", { signal }),
  deleteExport: (id: string) => api.del(`/api/reports/exports/${id}`),
  summary: (f: ReportFilters, signal?: AbortSignal) =>
    api.get<RevenueReportDto>("/api/reports/revenue", {
      signal,
      query: {
        fromDate: f.fromDate,
        toDate: f.toDate,
        sportId: f.sportId || undefined,
        source: f.source || undefined,
        memberId: f.memberId || undefined,
      },
    }),
  dimensions: (f: ReportFilters, signal?: AbortSignal) =>
    api.get<RevenueDimensionsDto>("/api/reports/revenue-dimensions", {
      signal,
      query: {
        ...f,
        sportId: f.sportId || undefined,
        source: f.source || undefined,
        memberId: f.memberId || undefined,
      },
    }),
  classes: (f: ReportFilters, signal?: AbortSignal) =>
    api.get<ClassEnrollmentReportDto>("/api/reports/class-enrollment", {
      signal,
      query: {
        fromDate: f.fromDate,
        toDate: f.toDate,
        sportId: f.sportId || undefined,
      },
    }),
  membership: (f: ReportFilters, signal?: AbortSignal) =>
    api.get<{
      newMembers: number;
      activeMembersAtPeriodEnd: number;
      membersPurchasingMembershipInPeriod: number;
      dayPassesSold?: number;
      daily?: { date: string; buyers: number }[];
    }>("/api/reports/membership-period", {
      signal,
      query: { fromDate: f.fromDate, toDate: f.toDate },
    }),
  exports: (page: number, signal?: AbortSignal) =>
    api.get<Paged<ReportExportDto>>("/api/reports/exports", {
      signal,
      query: { page, pageSize: 20 },
    }),
};

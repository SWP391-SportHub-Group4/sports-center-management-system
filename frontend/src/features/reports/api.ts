import { api } from "@/lib/apiClient";
import type {
  RevenueReportDto,
  RevenueDimensionsDto,
  ClassEnrollmentReportDto,
  Paged,
  ReportExportDto,
} from "@/lib/types";
export interface ReportFilters {
  fromDate: string;
  toDate: string;
  sportId: string;
  source: string;
  memberId: string;
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
      query: { fromDate: f.fromDate, toDate: f.toDate },
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

import { api } from "@/lib/apiClient";
import type { RevenueReportDto, RevenueDimensionsDto, ClassEnrollmentReportDto, Paged, ReportExportDto } from "@/lib/types";
export interface ReportFilters { fromDate: string; toDate: string; sportId: string; source: string; externalCoachId: string }
export const reportsApi = {
 summary: (f: ReportFilters, signal?: AbortSignal) => api.get<RevenueReportDto>("/api/reports/revenue", { signal, query: { fromDate: f.fromDate, toDate: f.toDate } }),
 dimensions: (f: ReportFilters, signal?: AbortSignal) => api.get<RevenueDimensionsDto>("/api/reports/revenue-dimensions", { signal, query: { ...f, sportId: f.sportId || undefined, source: f.source || undefined, externalCoachId: f.externalCoachId || undefined } }),
 classes: (f: ReportFilters, signal?: AbortSignal) => api.get<ClassEnrollmentReportDto>("/api/reports/class-enrollment", { signal, query: { fromDate: f.fromDate, toDate: f.toDate, sportId: f.sportId || undefined } }),
 membership: (f: ReportFilters, signal?: AbortSignal) => api.get<{ newMembers: number; activeMembersAtPeriodEnd: number }>("/api/reports/membership-period", { signal, query: { fromDate: f.fromDate, toDate: f.toDate } }),
 exports: (page: number, signal?: AbortSignal) => api.get<Paged<ReportExportDto>>("/api/reports/exports", { signal, query: { page, pageSize: 20 } }),
};

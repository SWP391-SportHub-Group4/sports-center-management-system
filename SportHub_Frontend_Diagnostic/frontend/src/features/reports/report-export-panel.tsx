"use client";
import { ConfirmRecordAction } from "@/components/ConfirmRecordAction";
import { Trash2 } from "lucide-react";
import { pagedItems } from "@/lib/paged";
import { useState } from "react";
import { AsyncSection, Card, Field, Pager, StatusChip } from "@/components/ui";
import { api, downloadFile } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { MutationFeedback, useMutation } from "@/features/operations";
import { reportsApi, type ReportFilters } from "./api";
import { formatDate, formatDateTime } from "@/lib/format";
import { financeStyles as fin } from "@/features/finance";
import { useEffect } from "react";
import styles from "./reports.module.css";
const columnsByType: Record<string, string[]> = {
  REVENUE_DIMENSIONS: [
    "source",
    "sportName",
    "memberName",
    "collectedAmount",
    "pointsRedeemed",
  ],
  COURT_RENTAL_REVENUE: [
    "source",
    "sportName",
    "memberName",
    "collectedAmount",
    "pointsRedeemed",
  ],
  REVENUE_SUMMARY: [
    "collectedAmount",
    "reconciliationCashCollected",
    "pointsRedeemed",
    "pointsIssued",
    "managerPointAdjustment",
    "outstandingPoints",
  ],
  CLASS_ENROLLMENT: [
    "name",
    "sportName",
    "capacity",
    "confirmedCount",
    "activeHoldCount",
    "availableSeats",
    "fillRatio",
    "breakEvenThreshold",
    "thresholdStatus",
  ],
  MEMBERSHIP_PERIOD: [
    "newMembers",
    "membersPurchasingMembershipInPeriod",
    "activeMembersAtPeriodEnd",
  ],
};
export function ReportTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const labels: Record<string, string> = {
    REVENUE_DIMENSIONS: l.dimensions,
    COURT_RENTAL_REVENUE: l.rentals,
    REVENUE_SUMMARY: l.revenuePointsSummary,
    CLASS_ENROLLMENT: l.enrollment,
    MEMBERSHIP_PERIOD: l.membership,
    REVENUE: "Invoices by issue date",
    REVENUE_DAILY: "Cash collected by payment date",
  };
  return (
    <Field label={l.exportType}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {Object.keys(columnsByType).map((key) => (
          <option key={key} value={key}>
            {labels[key]}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ReportExportPanel({
  filters,
  type,
}: {
  filters: ReportFilters;
  type: string;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const [selectedColumns, setSelectedColumns] = useState<
    Record<string, string[]>
  >({});
  const columns = selectedColumns[type] ?? [];
  const setColumns = (next: string[]) =>
    setSelectedColumns((current) => ({ ...current, [type]: next }));
  const [format, setFormat] = useState("Csv");
  const [page, setPage] = useState(1);
  const mutation = useMutation();
  const state = useApi((signal) => reportsApi.exports(page, signal), [page]);
  useEffect(() => {
    const rows = pagedItems(state.data);
    if (
      !rows.some(
        (x) =>
          !["COMPLETED", "FAILED", "EXPIRED"].includes(x.status.toUpperCase()),
      )
    )
      return;
    const id = window.setInterval(state.reload, 5000);
    return () => window.clearInterval(id);
  }, [state.data, state.reload]);
  const dimensional =
    type === "REVENUE_DIMENSIONS" || type === "COURT_RENTAL_REVENUE";
  const labels: Record<string, string> = {
    REVENUE_DIMENSIONS: l.dimensions,
    COURT_RENTAL_REVENUE: l.rentals,
    REVENUE_SUMMARY: l.revenuePointsSummary,
    CLASS_ENROLLMENT: l.enrollment,
    MEMBERSHIP_PERIOD: l.membership,
    REVENUE: "Invoices by issue date",
    REVENUE_DAILY: "Cash collected by payment date",
  };
  const columnLabels: Record<string, string> = {
    source: l.source,
    sportName: l.sport,
    memberName: l.member,
    collectedAmount: l.cash,
    reconciliationCashCollected: l.reconciliationCash,
    pointsRedeemed: l.redeemedPoints,
    pointsIssued: l.issued,
    managerPointAdjustment: l.adjusted,
    outstandingPoints: l.outstanding,
    name: l.title,
    capacity: l.capacity,
    confirmedCount: l.confirmed,
    activeHoldCount: l.holds,
    availableSeats: l.available,
    fillRatio: l.fillRatio,
    breakEvenThreshold: l.threshold,
    thresholdStatus: l.status,
    newMembers: l.newMembers,
    membersPurchasingMembershipInPeriod: l.purchasingMembers,
    activeMembersAtPeriodEnd: l.activeMembers.replace(
      "{date}",
      formatDate(filters.toDate),
    ),
  };
  return (
    <Card title={l.export}>
      <form
        className={`form ${styles.exportForm}`}
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await mutation.run(() =>
              api.post("/api/reports/exports", {
                reportType: type,
                fromDate: filters.fromDate,
                toDate: filters.toDate,
                columns,
                format,
                sportId:
                  dimensional || type === "CLASS_ENROLLMENT"
                    ? filters.sportId
                      ? Number(filters.sportId)
                      : null
                    : null,
                source: dimensional
                  ? type === "COURT_RENTAL_REVENUE"
                    ? "RENTAL"
                    : filters.source || null
                  : null,
                memberId: dimensional ? filters.memberId || null : null,
              }),
            )
          )
            state.reload();
        }}
      >
        <p>
          {labels[type]} · {formatDate(filters.fromDate)} –{" "}
          {formatDate(filters.toDate)}
        </p>
        {[
          "REVENUE_SUMMARY",
          "REVENUE_DIMENSIONS",
          "COURT_RENTAL_REVENUE",
        ].includes(type) && <p>{l.cashBasisHint}</p>}
        {type === "REVENUE_SUMMARY" && (
          <>
            <p>{l.globalPoints}</p>
            <p>{l.currentPointHint}</p>
          </>
        )}
        <fieldset className={styles.columns}>
          <legend>{l.columns}</legend>
          <div className={styles.columnList}>
            {columnsByType[type].map((c) => (
              <label key={c} className={styles.column}>
                <input
                  type="checkbox"
                  checked={columns.includes(c)}
                  onChange={(e) =>
                    setColumns(
                      e.target.checked
                        ? [...columns, c]
                        : columns.filter((x) => x !== c),
                    )
                  }
                />
                <span>{columnLabels[c] ?? c}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={l.format}>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="Csv">CSV</option>
            <option value="Pdf">PDF</option>
          </select>
        </Field>
        <button className="btn" disabled={mutation.busy || !columns.length}>
          {l.export}
        </button>
      </form>
      <MutationFeedback mutation={mutation} />
      <h3>{l.exportHistory}</h3>

      <AsyncSection state={state}>
        {(data) => {
          const rows = pagedItems(data);
          return (
            <>
              {!rows.length && <p>{t.finOps.exportEmpty}</p>}
              {rows.map((r) => {
                const final = ["COMPLETED", "FAILED", "EXPIRED"].includes(
                  r.status.toUpperCase(),
                );
                return (
                  <article key={r.reportExportId} className={fin.exportRow}>
                    <div>
                      <strong>
                        {labels[r.reportType] ?? r.reportType} ·{" "}
                        {r.format.toUpperCase()}
                      </strong>
                      <span>
                        {[
                          t.finOps.exportRequested.replace(
                            "{date}",
                            formatDateTime(r.createdAt),
                          ),
                          r.status === "COMPLETED"
                            ? t.finOps.exportRows.replace(
                                "{n}",
                                String(r.rowCount),
                              )
                            : null,
                          r.status === "COMPLETED"
                            ? t.finOps.exportExpires.replace(
                                "{date}",
                                formatDateTime(r.expiresAt),
                              )
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {!final && (
                        <span role="status">{t.finOps.exportPreparing}</span>
                      )}
                      {r.failureReason && (
                        <span role="alert">{r.failureReason}</span>
                      )}
                    </div>
                    <div className="btn-row">
                      <StatusChip value={r.status} />

                      {r.status === "COMPLETED" && (
                        <button
                          className="btn btn--secondary"
                          disabled={mutation.busy}
                          onClick={() =>
                            mutation.run(() =>
                              downloadFile(
                                `/api/reports/exports/${r.reportExportId}/download`,
                                `${r.reportType}.${r.format.toLowerCase()}`,
                              ),
                            )
                          }
                        >
                          {l.download}
                        </button>
                      )}
                      {r.status === "FAILED" && (
                        <button
                          className="btn btn--secondary"
                          disabled={mutation.busy}
                          onClick={async () => {
                            if (
                              await mutation.run(() =>
                                api.post(
                                  `/api/reports/exports/${r.reportExportId}/retry`,
                                ),
                              )
                            )
                              state.reload();
                          }}
                        >
                          {t.common.retry}
                        </button>
                      )}
                      <ConfirmRecordAction
                        triggerIcon={<Trash2 size={18} aria-hidden="true" />}
                        label={t.recordActions.delete}
                        title={t.recordActions.deleteExport}
                        description={t.recordActions.exportDescription}
                        recordName={`${labels[r.reportType] ?? r.reportType} / ${r.format.toUpperCase()} / ${formatDateTime(r.createdAt)}`}
                        onConfirm={() =>
                          reportsApi.deleteExport(r.reportExportId)
                        }
                        onCompleted={() => {
                          if (page !== 1) setPage(1);
                          else state.reload();
                        }}
                      />
                    </div>
                  </article>
                );
              })}
              <Pager
                page={data.page}
                pageSize={data.pageSize}
                totalCount={data.totalCount}
                onChange={setPage}
              />
            </>
          );
        }}
      </AsyncSection>
    </Card>
  );
}

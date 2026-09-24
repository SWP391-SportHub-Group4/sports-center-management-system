"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  AsyncSection,
  Card,
  Feedback,
  Field,
  Stat,
  StatusChip,
  Table,
} from "@/components/ui";
import { api, downloadFile } from "@/lib/apiClient";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  todayIso,
} from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { Paged, ReportExportDto, RevenueReportDto } from "@/lib/types";

/** BR-44 — chỉ xuất những cột được chọn RÕ RÀNG trước khi xuất, không có mặc định "lấy hết". */
const COLUMN_SETS: Record<string, { key: string; label: string }[]> = {
  REVENUE: [
    { key: "invoiceNumber", label: "Number of invoices" },
    { key: "issuedAt", label: "Name" },
    { key: "memberEmail", label: "Members email" },
    { key: "memberName", label: "Name of the Fellow" },
    { key: "totalAmount", label: "Total Money" },
    // BR-41 v1.4 — sáu đại lượng tách bạch. Cột "Điều chỉnh"/"Doanh thu ròng" cũ gộp giảm
    // nghĩa vụ với tiền hoàn nên đã bị bỏ khỏi whitelist ở backend.
    { key: "collectedAmount", label: "Retrieved" },
    { key: "obligationReduction", label: "Reduced Roles" },
    { key: "refundedAmount", label: "Completed" },
    { key: "netCollected", label: "In fact." },
    { key: "netPayable", label: "The Role" },
    { key: "outstanding", label: "We're gonna take it." },
    { key: "refundDue", label: "Need to Complete" },
    { key: "status", label: "Status" },
    { key: "dueDate", label: "Pay limit" },
  ],
  MEMBER_SUMMARY: [
    { key: "email", label: "Email" },
    { key: "fullName", label: "Name" },
    { key: "phone", label: "Schedule" },
    { key: "status", label: "Account Status" },
    { key: "joinedAt", label: "Date of participation" },
    { key: "activePackages", label: "Number of packages active" },
    { key: "remainingSessions", label: "The rest of the session." },
    { key: "totalSpent", label: "The sum is spent" },
  ],
};

/**
 * Báo cáo doanh thu (BR-32, BR-43 — chỉ Quản lý; thu ròng = đã thu trừ đã THỰC HOÀN)
 * và tệp xuất (BR-44 → BR-48).
 *
 * BR-48 v1.4: xuất được cả CSV và PDF; PDF là định dạng bắt buộc và CSV không thay thế.
 */
export default function ReportsPage() {
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [range, setRange] = useState({ from: monthStart, to: today });
  const [reportType, setReportType] = useState("REVENUE");
  const [format, setFormat] = useState("Csv");
  const [columns, setColumns] = useState<string[]>(
    COLUMN_SETS.REVENUE.map((column) => column.key),
  );

  const action = useAction();

  const revenue = useApi(
    (signal) =>
      api.get<RevenueReportDto>("/api/reports/revenue", {
        signal,
        query: { fromDate: range.from, toDate: range.to },
      }),
    [range.from, range.to],
  );

  const exports = useApi(
    (signal) =>
      api.get<Paged<ReportExportDto>>("/api/reports/exports", {
        signal,
        query: { pageSize: 20 },
      }),
    [],
  );

  const createExport = async (event: React.FormEvent) => {
    event.preventDefault();

    const done = await action.run(
      () =>
        api.post("/api/reports/exports", {
          reportType,
          fromDate: range.from,
          toDate: range.to,
          columns,
          format,
        }),
      "Create output file.",
    );

    if (done !== null) exports.reload();
  };

  const download = async (item: ReportExportDto) => {
    await action.run(
      () =>
        downloadFile(
          `/api/reports/exports/${item.reportExportId}/download`,
          `${item.reportType.toLowerCase()}.${item.format?.toLowerCase() === "pdf" ? "pdf" : "csv"}`,
        ),
      "Downloaded file.",
    );
  };

  const retry = async (item: ReportExportDto) => {
    const done = await action.run(
      () => api.post(`/api/reports/exports/${item.reportExportId}/retry`),
      "Recreated output file.",
    );

    if (done !== null) exports.reload();
  };

  const remove = async (item: ReportExportDto) => {
    const done = await action.run(
      () => api.del(`/api/reports/exports/${item.reportExportId}`),
      "The output file has been deleted — the previous download link is no longer accessible.",
    );

    if (done !== null) exports.reload();
  };

  return (
    <AppShell
      title="The sales report"
      description="Retrieved = Retrieved GRI is complete by payday; reduced personal obligations (BR-43)"
      allow={["CenterManager"]}
    >
      <Card title="Season Report">
        <div className="form form--inline">
          <Field label="From Day">
            <input
              type="date"
              value={range.from}
              onChange={(event) =>
                setRange({ ...range, from: event.target.value })
              }
            />
          </Field>
          <Field label="days">
            <input
              type="date"
              value={range.to}
              onChange={(event) =>
                setRange({ ...range, to: event.target.value })
              }
            />
          </Field>
        </div>
      </Card>

      <div className="grid grid--stats">
        <Stat
          label="Retrieved during the period."
          value={formatMoney(revenue.data?.totalCollected ?? 0)}
        />
        <Stat
          label="Completed during the period"
          value={formatMoney(revenue.data?.totalRefunded ?? 0)}
          hint="Computing the date of the DSC, not the day of censorship (BR-43)"
        />
        <Stat
          label="Collect"
          value={formatMoney(revenue.data?.netRevenue ?? 0)}
          hint="Retrieved complete — not except for a reduction of obligations"
        />
        <Stat
          label="Reduced Roles"
          value={formatMoney(revenue.data?.totalObligationReduction ?? 0)}
          hint="Descartes/Correction — Showed separately, not minus the record (BR-43)"
        />
        <Stat
          label="Number of Records"
          value={revenue.data?.paymentCount ?? 0}
          hint={`Across ${revenue.data?.invoiceCount ?? 0} invoices · ${
            revenue.data?.refundCount ?? 0
          } refunds`}
        />
      </div>

      <Card title="Details by Date" bodyless>
        <AsyncSection
          state={revenue}
          emptyMessage="There was no data in the period."
        >
          {(data) => (
            <Table
              headers={[
                "Date",
                { text: "Retrieved", numeric: true },
                { text: "Completed", numeric: true },
                { text: "Reduced Roles", numeric: true },
                { text: "Collect", numeric: true },
              ]}
            >
              {data.daily
                .filter(
                  (row) =>
                    row.collected !== 0 ||
                    row.refunded !== 0 ||
                    row.obligationReduction !== 0,
                )
                .map((row) => (
                  <tr key={row.date}>
                    <td className="nowrap">{formatDate(row.date)}</td>
                    <td className="num">{formatMoney(row.collected)}</td>
                    <td className="num">{formatMoney(row.refunded)}</td>
                    <td className="num muted">
                      {formatMoney(row.obligationReduction)}
                    </td>
                    <td className="num">
                      <strong>{formatMoney(row.net)}</strong>
                    </td>
                  </tr>
                ))}
            </Table>
          )}
        </AsyncSection>
      </Card>

      <Card
        title="Export Data"
        hint="The output file only contains columns you select (BR-44). CBS and PDF support (BR-48)."
      >
        <form className="form" onSubmit={createExport}>
          <div className="form form--inline">
            <Field label="Report Type">
              <select
                value={reportType}
                onChange={(event) => {
                  setReportType(event.target.value);
                  setColumns(
                    COLUMN_SETS[event.target.value].map((column) => column.key),
                  );
                }}
              >
                <option value="REVENUE">The sales are in the invoice.</option>
                <option value="MEMBER_SUMMARY">Competitive Members</option>
              </select>
            </Field>

            <Field
              label="Format"
              hint="PDF to print/send; DSV to open with Excel or load into another tool."
            >
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value)}
              >
                <option value="Csv">CSV</option>
                <option value="Pdf">PDF</option>
              </select>
            </Field>
          </div>

          <Field label="Columns to Output">
            <div className="btn-row">
              {COLUMN_SETS[reportType].map((column) => (
                <button
                  key={column.key}
                  type="button"
                  className={`btn btn--sm ${columns.includes(column.key) ? "" : "btn--ghost"}`}
                  onClick={() =>
                    setColumns((current) =>
                      current.includes(column.key)
                        ? current.filter((key) => key !== column.key)
                        : [...current, column.key],
                    )
                  }
                >
                  {column.label}
                </button>
              ))}
            </div>
          </Field>

          <Feedback error={action.error} success={action.success} />

          <div>
            <button
              type="submit"
              className="btn"
              disabled={action.busy || columns.length === 0}
            >
              {action.busy ? "Creating..." : "Create Output File"}
            </button>
          </div>
        </form>
      </Card>

      <Card
        title="Reschedule"
        hint="The file is saved at least 6 months (BR-46). Delete the file will make the previous download link run out of effect (BR-47)."
        bodyless
      >
        <AsyncSection
          state={exports}
          emptyMessage="No output file available."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Category",
                "Maker",
                "Create Time",
                { text: "Number of lines", numeric: true },
                "Status",
                "Save To",
                "",
              ]}
            >
              {data.items.map((item) => (
                <tr key={item.reportExportId}>
                  <td>{item.reportType}</td>
                  <td className="small">{item.requestedByName}</td>
                  <td className="nowrap small">
                    {formatDateTime(item.createdAt)}
                  </td>
                  <td className="num">{item.rowCount}</td>
                  <td>
                    <StatusChip value={item.status} />
                    {item.failureReason && (
                      <div
                        className="small"
                        style={{ color: "var(--danger-700)" }}
                      >
                        {item.failureReason}
                      </div>
                    )}
                  </td>
                  <td className="nowrap small">{formatDate(item.expiresAt)}</td>
                  <td className="right">
                    <div
                      className="btn-row"
                      style={{ justifyContent: "flex-end" }}
                    >
                      {item.status === "Completed" && (
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() => void download(item)}
                        >
                          Downloaded
                        </button>
                      )}
                      {item.status === "Failed" && (
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() => void retry(item)}
                        >
                          Retry
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => void remove(item)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>
    </AppShell>
  );
}

"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Feedback, Field, Stat, StatusChip, Table } from "@/components/ui";
import { api, downloadFile } from "@/lib/apiClient";
import { formatDate, formatDateTime, formatMoney, todayIso } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { Paged, ReportExportDto, RevenueReportDto } from "@/lib/types";

/** BR-44 — chỉ xuất những cột được chọn RÕ RÀNG trước khi xuất, không có mặc định "lấy hết". */
const COLUMN_SETS: Record<string, { key: string; label: string }[]> = {
  REVENUE: [
    { key: "invoiceNumber", label: "Số hóa đơn" },
    { key: "issuedAt", label: "Ngày phát hành" },
    { key: "memberEmail", label: "Email hội viên" },
    { key: "memberName", label: "Tên hội viên" },
    { key: "totalAmount", label: "Tổng tiền" },
    // BR-41 v1.4 — sáu đại lượng tách bạch. Cột "Điều chỉnh"/"Doanh thu ròng" cũ gộp giảm
    // nghĩa vụ với tiền hoàn nên đã bị bỏ khỏi whitelist ở backend.
    { key: "collectedAmount", label: "Đã thu" },
    { key: "obligationReduction", label: "Giảm nghĩa vụ" },
    { key: "refundedAmount", label: "Đã hoàn" },
    { key: "netCollected", label: "Thực thu" },
    { key: "netPayable", label: "Nghĩa vụ" },
    { key: "outstanding", label: "Còn phải thu" },
    { key: "refundDue", label: "Cần hoàn" },
    { key: "status", label: "Trạng thái" },
    { key: "dueDate", label: "Hạn thanh toán" },
  ],
  MEMBER_SUMMARY: [
    { key: "email", label: "Email" },
    { key: "fullName", label: "Họ tên" },
    { key: "phone", label: "Số điện thoại" },
    { key: "status", label: "Trạng thái tài khoản" },
    { key: "joinedAt", label: "Ngày tham gia" },
    { key: "activePackages", label: "Số gói đang hoạt động" },
    { key: "remainingSessions", label: "Tổng buổi còn lại" },
    { key: "totalSpent", label: "Tổng đã chi" },
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
      "Đã tạo tệp xuất.",
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
      "Đã tải tệp xuống.",
    );
  };

  const retry = async (item: ReportExportDto) => {
    const done = await action.run(
      () => api.post(`/api/reports/exports/${item.reportExportId}/retry`),
      "Đã tạo lại tệp xuất.",
    );

    if (done !== null) exports.reload();
  };

  const remove = async (item: ReportExportDto) => {
    const done = await action.run(
      () => api.del(`/api/reports/exports/${item.reportExportId}`),
      "Đã xóa tệp xuất — liên kết tải trước đó không còn truy cập được.",
    );

    if (done !== null) exports.reload();
  };

  return (
    <AppShell
      title="Báo cáo doanh thu"
      description="Thu ròng = đã thu − đã hoàn theo ngày thực trả; giảm nghĩa vụ tính riêng (BR-43)"
      allow={["CenterManager"]}
    >
      <Card title="Kỳ báo cáo">
        <div className="form form--inline">
          <Field label="Từ ngày">
            <input
              type="date"
              value={range.from}
              onChange={(event) => setRange({ ...range, from: event.target.value })}
            />
          </Field>
          <Field label="Đến ngày">
            <input
              type="date"
              value={range.to}
              onChange={(event) => setRange({ ...range, to: event.target.value })}
            />
          </Field>
        </div>
      </Card>

      <div className="grid grid--stats">
        <Stat label="Đã thu trong kỳ" value={formatMoney(revenue.data?.totalCollected ?? 0)} />
        <Stat
          label="Đã hoàn trong kỳ"
          value={formatMoney(revenue.data?.totalRefunded ?? 0)}
          hint="Tính theo ngày THỰC TRẢ, không phải ngày duyệt (BR-43)"
        />
        <Stat
          label="Thu ròng"
          value={formatMoney(revenue.data?.netRevenue ?? 0)}
          hint="Đã thu trừ đã hoàn — không trừ khoản giảm nghĩa vụ"
        />
        <Stat
          label="Giảm nghĩa vụ"
          value={formatMoney(revenue.data?.totalObligationReduction ?? 0)}
          hint="Discount/Correction — hiển thị riêng, không trừ vào thu ròng (BR-43)"
        />
        <Stat
          label="Số lần thu"
          value={revenue.data?.paymentCount ?? 0}
          hint={`Trên ${revenue.data?.invoiceCount ?? 0} hóa đơn · ${
            revenue.data?.refundCount ?? 0
          } lần hoàn`}
        />
      </div>

      <Card title="Chi tiết theo ngày" bodyless>
        <AsyncSection state={revenue} emptyMessage="Không có dữ liệu trong kỳ.">
          {(data) => (
            <Table
              headers={[
                "Ngày",
                { text: "Đã thu", numeric: true },
                { text: "Đã hoàn", numeric: true },
                { text: "Giảm nghĩa vụ", numeric: true },
                { text: "Thu ròng", numeric: true },
              ]}
            >
              {data.daily
                .filter(
                  (row) =>
                    row.collected !== 0 || row.refunded !== 0 || row.obligationReduction !== 0,
                )
                .map((row) => (
                  <tr key={row.date}>
                    <td className="nowrap">{formatDate(row.date)}</td>
                    <td className="num">{formatMoney(row.collected)}</td>
                    <td className="num">{formatMoney(row.refunded)}</td>
                    <td className="num muted">{formatMoney(row.obligationReduction)}</td>
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
        title="Xuất dữ liệu"
        hint="Tệp xuất chỉ chứa các cột bạn chọn (BR-44). Hỗ trợ CSV và PDF (BR-48)."
      >
        <form className="form" onSubmit={createExport}>
          <div className="form form--inline">
            <Field label="Loại báo cáo">
              <select
                value={reportType}
                onChange={(event) => {
                  setReportType(event.target.value);
                  setColumns(COLUMN_SETS[event.target.value].map((column) => column.key));
                }}
              >
                <option value="REVENUE">Doanh thu theo hóa đơn</option>
                <option value="MEMBER_SUMMARY">Tổng hợp hội viên</option>
              </select>
            </Field>

            <Field
              label="Định dạng"
              hint="PDF để in/gửi; CSV để mở bằng Excel hoặc nạp vào công cụ khác."
            >
              <select value={format} onChange={(event) => setFormat(event.target.value)}>
                <option value="Csv">CSV</option>
                <option value="Pdf">PDF</option>
              </select>
            </Field>
          </div>

          <Field label="Cột cần xuất">
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
            <button type="submit" className="btn" disabled={action.busy || columns.length === 0}>
              {action.busy ? "Đang tạo…" : "Tạo tệp xuất"}
            </button>
          </div>
        </form>
      </Card>

      <Card
        title="Tệp đã tạo"
        hint="Tệp được lưu tối thiểu 6 tháng (BR-46). Xóa tệp sẽ làm liên kết tải trước đó hết hiệu lực (BR-47)."
        bodyless
      >
        <AsyncSection
          state={exports}
          emptyMessage="Chưa có tệp xuất nào."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Loại",
                "Người tạo",
                "Tạo lúc",
                { text: "Số dòng", numeric: true },
                "Trạng thái",
                "Lưu đến",
                "",
              ]}
            >
              {data.items.map((item) => (
                <tr key={item.reportExportId}>
                  <td>{item.reportType}</td>
                  <td className="small">{item.requestedByName}</td>
                  <td className="nowrap small">{formatDateTime(item.createdAt)}</td>
                  <td className="num">{item.rowCount}</td>
                  <td>
                    <StatusChip value={item.status} />
                    {item.failureReason && (
                      <div className="small" style={{ color: "var(--danger-700)" }}>
                        {item.failureReason}
                      </div>
                    )}
                  </td>
                  <td className="nowrap small">{formatDate(item.expiresAt)}</td>
                  <td className="right">
                    <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                      {item.status === "Completed" && (
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() => void download(item)}
                        >
                          Tải CSV
                        </button>
                      )}
                      {item.status === "Failed" && (
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() => void retry(item)}
                        >
                          Thử lại
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => void remove(item)}
                      >
                        Xóa
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

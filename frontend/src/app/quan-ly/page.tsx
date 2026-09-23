"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Stat, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { addDaysIso, formatDate, formatDateTime, formatMoney, todayIso } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type {
  ClassSessionDto,
  InvoiceSummaryDto,
  Paged,
  PaymentAdjustmentDto,
  RevenueReportDto,
} from "@/lib/types";

export default function ManagerDashboardPage() {
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;

  const revenue = useApi(
    (signal) =>
      api.get<RevenueReportDto>("/api/reports/revenue", {
        signal,
        query: { fromDate: monthStart, toDate: today },
      }),
    [monthStart, today],
  );

  const pendingAdjustments = useApi(
    (signal) =>
      api.get<Paged<PaymentAdjustmentDto>>("/api/payment-adjustments", {
        signal,
        query: { status: "Requested", pageSize: 10 },
      }),
    [],
  );

  const overdue = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/invoices", {
        signal,
        query: { overdueOnly: true, pageSize: 5 },
      }),
    [],
  );

  const sessions = useApi(
    (signal) =>
      api.get<ClassSessionDto[]>("/api/class-sessions", {
        signal,
        query: { fromDate: today, toDate: addDaysIso(today, 6) },
      }),
    [today],
  );

  return (
    <AppShell
      title="Quản lý trung tâm"
      description="Doanh thu, lịch vận hành và các việc đang chờ xử lý"
      allow={["CenterManager"]}
    >
      <div className="grid grid--stats">
        <Stat
          label="Thu ròng tháng này"
          value={formatMoney(revenue.data?.netRevenue ?? 0)}
          hint={`Đã thu ${formatMoney(revenue.data?.totalCollected ?? 0)}, trừ đã hoàn ${formatMoney(revenue.data?.totalRefunded ?? 0)}`}
        />
        <Stat
          label="Điều chỉnh chờ duyệt"
          value={pendingAdjustments.data?.totalCount ?? 0}
          hint="Bạn không được duyệt yêu cầu do chính mình tạo (BR-42)"
        />
        <Stat
          label="Hóa đơn quá hạn"
          value={overdue.data?.totalCount ?? 0}
          hint="Theo hạn thanh toán BR-55"
        />
        <Stat label="Buổi học 7 ngày tới" value={sessions.data?.length ?? 0} />
      </div>

      <div className="row">
        <Link className="btn" href="/quan-ly/dieu-chinh">
          Duyệt điều chỉnh
        </Link>
        <Link className="btn btn--ghost" href="/quan-ly/lich-hoc">
          Quản lý lịch học
        </Link>
        <Link className="btn btn--ghost" href="/quan-ly/bao-cao">
          Báo cáo & xuất dữ liệu
        </Link>
      </div>

      <Card
        title="Yêu cầu điều chỉnh đang chờ"
        hint="Yêu cầu do Lễ tân tạo phải được Quản lý Trung tâm phê duyệt trước khi có hiệu lực (BR-42)."
        bodyless
      >
        <AsyncSection
          state={pendingAdjustments}
          emptyMessage="Không có yêu cầu nào đang chờ duyệt."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Hóa đơn",
                "Loại",
                { text: "Số tiền", numeric: true },
                "Lý do",
                "Người tạo",
                "Ngày tạo",
              ]}
            >
              {data.items.map((item) => (
                <tr key={item.adjustmentId}>
                  <td>{item.invoiceNumber}</td>
                  <td>
                    <StatusChip value={item.type} />
                  </td>
                  <td className="num">{formatMoney(item.amount)}</td>
                  <td className="small">{item.reason}</td>
                  <td className="small">{item.requestedByName}</td>
                  <td className="nowrap small">{formatDate(item.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>

      <Card title="Lịch học 7 ngày tới" bodyless>
        <AsyncSection
          state={sessions}
          emptyMessage="Chưa có buổi học nào được lên lịch."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Lớp",
                "Thời gian",
                "Phòng",
                "HLV",
                { text: "Lấp đầy", numeric: true },
                "Trạng thái",
              ]}
            >
              {data.slice(0, 12).map((session) => (
                <tr key={session.sessionId}>
                  <td>
                    <strong>{session.className}</strong>
                    <div className="small muted">{session.discipline}</div>
                  </td>
                  <td className="nowrap">{formatDateTime(session.startAtUtc)}</td>
                  <td>{session.roomName}</td>
                  <td>{session.coachName}</td>
                  <td className="num">
                    {session.confirmedCount}/{session.capacity}
                  </td>
                  <td>
                    <StatusChip value={session.status} />
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

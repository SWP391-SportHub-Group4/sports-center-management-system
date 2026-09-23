"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Stat, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { addDaysIso, todayIso } from "@/lib/format";
import type { ClassSessionDto, InvoiceSummaryDto, Paged } from "@/lib/types";

export default function ReceptionDashboardPage() {
  const today = todayIso();

  const todaySessions = useApi(
    (signal) =>
      api.get<ClassSessionDto[]>("/api/class-sessions", {
        signal,
        query: { fromDate: today, toDate: today },
      }),
    [today],
  );

  const overdue = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/invoices", {
        signal,
        query: { overdueOnly: true, pageSize: 10 },
      }),
    [],
  );

  const unpaid = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/invoices", {
        signal,
        query: { status: "Issued", pageSize: 10 },
      }),
    [],
  );

  return (
    <AppShell
      title="Quầy lễ tân"
      description="Điểm danh Gym, bán gói, thu tiền và hỗ trợ hội viên đặt lịch"
      allow={["Receptionist"]}
    >
      <div className="grid grid--stats">
        <Stat label="Buổi học hôm nay" value={todaySessions.data?.length ?? 0} />
        <Stat
          label="Hóa đơn chưa thu đồng nào"
          value={unpaid.data?.totalCount ?? 0}
          hint="Trạng thái Đã phát hành"
        />
        <Stat
          label="Hóa đơn quá hạn"
          value={overdue.data?.totalCount ?? 0}
          hint="Quá hạn thanh toán theo BR-55"
        />
        <Stat
          label="Hôm nay"
          value={formatDate(today)}
          hint={`Khoảng lịch tới ${formatDate(addDaysIso(today, 7))}`}
        />
      </div>

      <div className="row">
        <Link className="btn" href="/le-tan/gym-checkin">
          Gym check-in
        </Link>
        <Link className="btn btn--ghost" href="/le-tan/ban-goi">
          Bán gói thành viên
        </Link>
        <Link className="btn btn--ghost" href="/le-tan/dang-ky">
          Đăng ký lớp hộ hội viên
        </Link>
      </div>

      <Card title="Buổi học hôm nay" bodyless>
        <AsyncSection
          state={todaySessions}
          emptyMessage="Hôm nay không có buổi học nào."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Lớp",
                "Thời gian",
                "Phòng",
                "HLV",
                { text: "Đã đăng ký", numeric: true },
                "Trạng thái",
              ]}
            >
              {data.map((session) => (
                <tr key={session.sessionId}>
                  <td>
                    <strong>{session.className}</strong>
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

      <Card
        title="Hóa đơn quá hạn cần nhắc"
        hint="Hóa đơn quá hạn không tự bị hủy — cần liên hệ hội viên hoặc lập điều chỉnh có Quản lý duyệt (BR-40, BR-42)."
        bodyless
      >
        <AsyncSection
          state={overdue}
          emptyMessage="Không có hóa đơn nào quá hạn."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Số hóa đơn",
                "Hội viên",
                { text: "Còn phải thu", numeric: true },
                "Hạn thanh toán",
                "Trạng thái",
              ]}
            >
              {data.items.map((invoice) => (
                <tr key={invoice.invoiceId}>
                  <td>{invoice.invoiceNumber}</td>
                  <td>
                    {invoice.memberName}
                    <div className="small muted">{invoice.memberEmail}</div>
                  </td>
                  <td className="num">{formatMoney(invoice.outstanding)}</td>
                  <td className="nowrap small">{formatDate(invoice.dueDateUtc)}</td>
                  <td>
                    <StatusChip value={invoice.status} />
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

"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Stat, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import type {
  EnrollmentDto,
  MemberPackageDto,
  Paged,
  InvoiceSummaryDto,
} from "@/lib/types";

export default function MemberDashboardPage() {
  const { user } = useAuth();

  const packages = useApi(
    (signal) => api.get<MemberPackageDto[]>("/api/members/me/packages", { signal }),
    [],
  );

  const upcoming = useApi(
    (signal) =>
      api.get<EnrollmentDto[]>("/api/members/me/enrollments", {
        signal,
        query: { upcomingOnly: true },
      }),
    [],
  );

  const invoices = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/members/me/invoices", {
        signal,
        query: { pageSize: 5 },
      }),
    [],
  );

  const usable = packages.data?.filter((item) => item.isUsable) ?? [];

  // Gói không giới hạn buổi (remainingSessions = null) không cộng vào con số này — cộng 0
  // sẽ làm người dùng tưởng gói Gym tháng của mình đã hết buổi.
  const remaining = usable.reduce(
    (total, item) => total + (item.remainingSessions ?? 0),
    0,
  );

  const hasUnlimited = usable.some((item) => item.remainingSessions === null);

  const outstanding =
    invoices.data?.items.reduce((total, item) => total + item.outstanding, 0) ?? 0;

  return (
    <AppShell
      title={`Xin chào, ${user?.fullName ?? "hội viên"}`}
      description="Tổng quan hoạt động tập luyện của bạn"
      allow={["Member"]}
    >
      <div className="grid grid--stats">
        <Stat
          label="Gói đang dùng được"
          value={usable.length}
          hint={usable.map((item) => item.packageName).join(", ") || "Chưa có gói nào"}
        />
        <Stat
          label="Buổi còn lại"
          value={hasUnlimited ? `${remaining}+` : remaining}
          hint={hasUnlimited ? "Có gói không giới hạn số buổi" : "Tổng các gói còn hiệu lực"}
        />
        <Stat
          label="Buổi sắp tới"
          value={upcoming.data?.length ?? 0}
          hint="Đăng ký đã xác nhận chưa diễn ra"
        />
        <Stat
          label="Còn phải thanh toán"
          value={formatMoney(outstanding)}
          hint="Trên các hóa đơn gần đây"
        />
      </div>

      <Card
        title="Buổi học sắp tới"
        actions={
          <Link className="btn btn--ghost btn--sm" href="/hoi-vien/lich-lop">
            Đặt thêm buổi
          </Link>
        }
        bodyless
      >
        <AsyncSection
          state={upcoming}
          emptyMessage="Bạn chưa đăng ký buổi học nào sắp tới."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table headers={["Lớp", "Thời gian", "Phòng", "HLV", "Hạn hủy để được hoàn buổi"]}>
              {data.slice(0, 6).map((item) => (
                <tr key={item.enrollmentId}>
                  <td>
                    <strong>{item.session.className}</strong>
                    <div className="small muted">{item.session.discipline}</div>
                  </td>
                  <td className="nowrap">{formatDateTime(item.session.startAtUtc)}</td>
                  <td>{item.session.roomName}</td>
                  <td>{item.session.coachName}</td>
                  <td className="nowrap">
                    {formatDateTime(item.cancellationDeadlineUtc)}
                    <div className="small muted">
                      {item.cancellationDeadlineHours} giờ trước giờ học
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>

      <div className="grid grid--2">
        <Card title="Gói thành viên của bạn" bodyless>
          <AsyncSection
            state={packages}
            emptyMessage="Bạn chưa có gói thành viên nào. Liên hệ quầy lễ tân để đăng ký."
            isEmpty={(data) => data.length === 0}
          >
            {(data) => (
              <Table headers={["Gói", "Hiệu lực", "Buổi còn lại", "Trạng thái"]}>
                {data.map((item) => (
                  <tr key={item.memberPackageId}>
                    <td>{item.packageName}</td>
                    <td className="nowrap small">
                      {formatDate(item.startDate)} – {formatDate(item.endDate)}
                    </td>
                    <td className="num">
                      {item.remainingSessions === null ? "Không giới hạn" : item.remainingSessions}
                    </td>
                    <td>
                      <StatusChip value={item.status} />
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </AsyncSection>
        </Card>

        <Card title="Hóa đơn gần đây" bodyless>
          <AsyncSection
            state={invoices}
            emptyMessage="Chưa có hóa đơn nào."
            isEmpty={(data) => data.items.length === 0}
          >
            {(data) => (
              <Table
                headers={["Số hóa đơn", "Ngày", { text: "Còn phải trả", numeric: true }, "Trạng thái"]}
              >
                {data.items.map((item) => (
                  <tr key={item.invoiceId}>
                    <td>{item.invoiceNumber}</td>
                    <td className="nowrap small">{formatDate(item.issuedAt)}</td>
                    <td className="num">{formatMoney(item.outstanding)}</td>
                    <td>
                      <StatusChip value={item.status} />
                      {item.isOverdue && <div className="small" style={{ color: "var(--danger-700)" }}>Quá hạn</div>}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </AsyncSection>
        </Card>
      </div>
    </AppShell>
  );
}

"use client";

import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { MemberPackageDto, MembershipPackageDto } from "@/lib/types";

/**
 * Gói của hội viên (BR-9, BR-11) và danh mục gói đang bán (BR-8).
 * Hội viên không tự mua ở đây: BR-30 quy định hóa đơn phát hành tại quầy trước khi thu tiền,
 * nên việc mua gói đi qua Lễ tân.
 */
export default function MyPackagesPage() {
  const myPackages = useApi(
    (signal) => api.get<MemberPackageDto[]>("/api/members/me/packages", { signal }),
    [],
  );

  const catalog = useApi(
    (signal) => api.get<MembershipPackageDto[]>("/api/membership-packages", { signal }),
    [],
  );

  return (
    <AppShell
      title="Gói thành viên"
      description="Gói bạn đang sở hữu và danh mục gói đang được bán"
      allow={["Member"]}
    >
      <Card title="Gói của tôi" bodyless>
        <AsyncSection
          state={myPackages}
          emptyMessage="Bạn chưa có gói thành viên nào."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Gói",
                "Hiệu lực",
                { text: "Buổi còn lại", numeric: true },
                "Trạng thái",
                "Ghi chú",
              ]}
            >
              {data.map((item) => (
                <tr key={item.memberPackageId}>
                  <td>
                    <strong>{item.packageName}</strong>
                  </td>
                  <td className="nowrap small">
                    {formatDate(item.startDate)} – {formatDate(item.endDate)}
                  </td>
                  <td className="num">
                    {item.remainingSessions === null
                      ? "Không giới hạn"
                      : `${item.remainingSessions}${item.sessionLimit ? ` / ${item.sessionLimit}` : ""}`}
                  </td>
                  <td>
                    <StatusChip value={item.status} />
                    {item.status === "Active" && !item.isUsable && (
                      <div className="small muted">Chưa tới ngày bắt đầu</div>
                    )}
                  </td>
                  <td className="small muted">
                    {item.stackingApproved
                      ? `Được Quản lý cho phép cộng dồn: ${item.stackingApprovalReason ?? ""}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>

      <Card
        title="Danh mục gói đang bán"
        hint="Liên hệ quầy lễ tân để mua hoặc gia hạn — hóa đơn được phát hành ngay khi chọn gói."
        bodyless
      >
        <AsyncSection
          state={catalog}
          emptyMessage="Chưa có gói nào đang được bán."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Gói",
                { text: "Giá", numeric: true },
                { text: "Thời hạn", numeric: true },
                { text: "Số buổi", numeric: true },
                "Mô tả",
              ]}
            >
              {data.map((item) => (
                <tr key={item.packageId}>
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td className="num">{formatMoney(item.price)}</td>
                  <td className="num">{item.durationDays} ngày</td>
                  <td className="num">
                    {item.sessionLimit === null ? "Không giới hạn" : item.sessionLimit}
                  </td>
                  <td className="small muted">{item.description ?? "—"}</td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>
    </AppShell>
  );
}

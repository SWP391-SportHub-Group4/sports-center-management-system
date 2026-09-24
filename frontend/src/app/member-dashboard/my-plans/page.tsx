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
      title="Members Package"
      description="Packages you own and package items are being sold"
      allow={["Member"]}
    >
      <Card title="My package" bodyless>
        <AsyncSection
          state={myPackages}
          emptyMessage="You don't have any membership packages."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Packages",
                "Effects",
                { text: "The other day.", numeric: true },
                "Status",
                "Notes",
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
                      ? "No Limit"
                      : `${item.remainingSessions}${item.sessionLimit ? ` / ${item.sessionLimit}` : ""}`}
                  </td>
                  <td>
                    <StatusChip value={item.status} />
                    {item.status === "Active" && !item.isUsable && (
                      <div className="small muted">Name</div>
                    )}
                  </td>
                  <td className="small muted">
                    {item.stackingApproved
                      ? `Stacking allowed by the manager: ${item.stackingApprovalReason ?? ""}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>

      <Card
        title="Package catalog is selling"
        hint="Contact the front desk for purchase or extensions — the invoice is released as soon as the package is selected."
        bodyless
      >
        <AsyncSection
          state={catalog}
          emptyMessage="No packages have yet been sold."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Packages",
                { text: "Price", numeric: true },
                { text: "Timeout", numeric: true },
                { text: "Number of Sessions", numeric: true },
                "Description",
              ]}
            >
              {data.map((item) => (
                <tr key={item.packageId}>
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td className="num">{formatMoney(item.price)}</td>
                  <td className="num">{item.durationDays} days</td>
                  <td className="num">
                    {item.sessionLimit === null ? "No Limit" : item.sessionLimit}
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

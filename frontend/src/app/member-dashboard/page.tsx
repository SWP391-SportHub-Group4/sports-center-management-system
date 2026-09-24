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
      title={`Hello, ${user?.fullName ?? "member"}`}
      description="General Your Practices"
      allow={["Member"]}
    >
      <div className="grid grid--stats">
        <Stat
          label="Available Package"
          value={usable.length}
          hint={usable.map((item) => item.packageName).join(", ") || "No packages available"}
        />
        <Stat
          label="The other day."
          value={hasUnlimited ? `${remaining}+` : remaining}
          hint={hasUnlimited ? "Unlimited package session number" : "Total packages still valid"}
        />
        <Stat
          label="The next session."
          value={upcoming.data?.length ?? 0}
          hint="Register confirmed that it has not yet occurred"
        />
        <Stat
          label="I have to pay for this."
          value={formatMoney(outstanding)}
          hint="On recent invoices"
        />
      </div>

      <Card
        title="The Study Is Coming"
        actions={
          <Link className="btn btn--ghost btn--sm" href="/member-dashboard/class-schedule">
            Set more session
          </Link>
        }
        bodyless
      >
        <AsyncSection
          state={upcoming}
          emptyMessage="You have not enrolled in any of the meetings to come."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table headers={["Class", "Time", "Room", "HLV", "Cancel to complete session"]}>
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
                      {item.cancellationDeadlineHours} magazines before class.
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>

      <div className="grid grid--2">
        <Card title="Your member package" bodyless>
          <AsyncSection
            state={packages}
            emptyMessage="You don't have a member package. You can sign up on the front desk."
            isEmpty={(data) => data.length === 0}
          >
            {(data) => (
              <Table headers={["Packages", "Effects", "The other day.", "Status"]}>
                {data.map((item) => (
                  <tr key={item.memberPackageId}>
                    <td>{item.packageName}</td>
                    <td className="nowrap small">
                      {formatDate(item.startDate)} – {formatDate(item.endDate)}
                    </td>
                    <td className="num">
                      {item.remainingSessions === null ? "No Limit" : item.remainingSessions}
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

        <Card title="Recent invoices" bodyless>
          <AsyncSection
            state={invoices}
            emptyMessage="No receipts yet."
            isEmpty={(data) => data.items.length === 0}
          >
            {(data) => (
              <Table
                headers={["Number of invoices", "Date", { text: "I have to pay.", numeric: true }, "Status"]}
              >
                {data.items.map((item) => (
                  <tr key={item.invoiceId}>
                    <td>{item.invoiceNumber}</td>
                    <td className="nowrap small">{formatDate(item.issuedAt)}</td>
                    <td className="num">{formatMoney(item.outstanding)}</td>
                    <td>
                      <StatusChip value={item.status} />
                      {item.isOverdue && <div className="small" style={{ color: "var(--danger-700)" }}>Expiration</div>}
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

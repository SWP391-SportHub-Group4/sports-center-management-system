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
      title="Centre Management"
      description="The sales, schedules, and tasks are pending."
      allow={["CenterManager"]}
    >
      <div className="grid grid--stats">
        <Stat
          label="Retrieved this month"
          value={formatMoney(revenue.data?.netRevenue ?? 0)}
          hint={`Collected ${formatMoney(revenue.data?.totalCollected ?? 0)}, less refunds ${formatMoney(revenue.data?.totalRefunded ?? 0)}`}
        />
        <Stat
          label="Browseing Waits Adjustment"
          value={pendingAdjustments.data?.totalCount ?? 0}
          hint="You are not censored for requests created by yourself (BR-42)"
        />
        <Stat
          label="The invoice is expired."
          value={overdue.data?.totalCount ?? 0}
          hint="As of the BR-55 payment deadline"
        />
        <Stat label="The next seven days of study." value={sessions.data?.length ?? 0} />
      </div>

      <div className="row">
        <Link className="btn" href="/manager/payment-adjustments">
          Adapted Browser
        </Link>
        <Link className="btn btn--ghost" href="/manager/class-schedule">
          Manage your schedules
        </Link>
        <Link className="btn btn--ghost" href="/manager/reports">
          & Data Output Report
        </Link>
      </div>

      <Card
        title="The pending adjustment request"
        hint="The request created by the reception required to be approved by the Center before being effective (BR-42)."
        bodyless
      >
        <AsyncSection
          state={pendingAdjustments}
          emptyMessage="There is no request pending."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Invoices",
                "Category",
                { text: "The Money", numeric: true },
                "Reasons",
                "Maker",
                "Name",
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

      <Card title="School schedule for the next seven days." bodyless>
        <AsyncSection
          state={sessions}
          emptyMessage="No study has yet been scheduled."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Class",
                "Time",
                "Room",
                "HLV",
                { text: "Filler", numeric: true },
                "Status",
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

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
      title="New reception."
      description="Gym Score, Selling Packages, Collecting and Supporting Fellow Scheduled"
      allow={["Receptionist"]}
    >
      <div className="grid grid--stats">
        <Stat label="Today's study" value={todaySessions.data?.length ?? 0} />
        <Stat
          label="The invoice hasn't made any money yet."
          value={unpaid.data?.totalCount ?? 0}
          hint="Status Released"
        />
        <Stat
          label="The invoice is expired."
          value={overdue.data?.totalCount ?? 0}
          hint="Payout deadline according to BR-55"
        />
        <Stat
          label="Today"
          value={formatDate(today)}
          hint={`Upcoming schedule range ${formatDate(addDaysIso(today, 7))}`}
        />
      </div>

      <div className="row">
        <Link className="btn" href="/receptionist/gym-checkin">
          Gym check-in
        </Link>
        <Link className="btn btn--ghost" href="/receptionist/sell-plans">
          Selling member packages
        </Link>
        <Link className="btn btn--ghost" href="/receptionist/registrations">
          Subscription of the Fellowship Class
        </Link>
      </div>

      <Card title="Today's study" bodyless>
        <AsyncSection
          state={todaySessions}
          emptyMessage="There's no study today."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Class",
                "Time",
                "Room",
                "HLV",
                { text: "Registered", numeric: true },
                "Status",
              ]}
            >
              {data.map((session) => (
                <tr key={session.sessionId}>
                  <td>
                    <strong>{session.className}</strong>
                  </td>
                  <td className="nowrap">
                    {formatDateTime(session.startAtUtc)}
                  </td>
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
        title="Payout is expired."
        hint="Over-register invoices are not self-destructive — needing membership or adjustment with browser management (BR-40, BR-42)."
        bodyless
      >
        <AsyncSection
          state={overdue}
          emptyMessage="No invoices are expired."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Number of invoices",
                "Members",
                { text: "We're gonna take it.", numeric: true },
                "Pay limit",
                "Status",
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
                  <td className="nowrap small">
                    {formatDate(invoice.dueDateUtc)}
                  </td>
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

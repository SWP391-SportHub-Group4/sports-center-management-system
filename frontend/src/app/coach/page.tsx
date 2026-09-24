"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Stat, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { addDaysIso, formatDateTime, todayIso } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import type { ClassSessionDto, CoachMemberRelationshipDto } from "@/lib/types";

export default function CoachDashboardPage() {
  const { user } = useAuth();
  const today = todayIso();

  const week = useApi(
    (signal) =>
      api.get<ClassSessionDto[]>("/api/class-sessions/mine", {
        signal,
        query: { fromDate: today, toDate: addDaysIso(today, 6) },
      }),
    [today],
  );

  const members = useApi(
    (signal) =>
      api.get<CoachMemberRelationshipDto[]>("/api/coach-member-relationships", {
        signal,
        query: { activeOnly: true },
      }),
    [],
  );

  const todaySessions =
    week.data?.filter((session) => session.startAtUtc.slice(0, 10) === today) ?? [];

  return (
    <AppShell
      title={`Hello, ${user?.fullName ?? "Coach."}`}
      description="Calendar, Organizer, and Training Tool"
      allow={["Coach"]}
    >
      <div className="grid grid--stats">
        <Stat label="Today's lesson" value={todaySessions.length} />
        <Stat label="The next seven days of teaching." value={week.data?.length ?? 0} />
        <Stat
          label="Members are in charge"
          value={members.data?.length ?? 0}
          hint="Active Training Relationship (BR-23)"
        />
      </div>

      <div className="row">
        <Link className="btn" href="/coach/attendance">
          & Write Results
        </Link>
        <Link className="btn btn--ghost" href="/coach/training-plans">
          Edit Training Planning
        </Link>
        <Link className="btn btn--ghost" href="/coach/ai-suggestions">
          Please suggest AI
        </Link>
      </div>

      <Card title="Reschedule" bodyless>
        <AsyncSection
          state={week}
          emptyMessage="You haven't been assigned a lecture in seven days."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Class",
                "Time",
                "Room",
                { text: "Registered", numeric: true },
                "Status",
              ]}
            >
              {data.map((session) => (
                <tr key={session.sessionId}>
                  <td>
                    <strong>{session.className}</strong>
                    <div className="small muted">{session.discipline}</div>
                  </td>
                  <td className="nowrap">{formatDateTime(session.startAtUtc)}</td>
                  <td>{session.roomName}</td>
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
        title="Members are in charge"
        hint="Only with these members have you created the exercise plan and offered AI (BR-23)."
        bodyless
      >
        <AsyncSection
          state={members}
          emptyMessage="You have not yet been in charge of any member; the relationship will arise when the members sign up for your class, either due to the CBS."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table headers={["Members", "The Source of Relationships", "Class", "Start"]}>
              {data.map((item) => (
                <tr key={item.relationshipId}>
                  <td>
                    <strong>{item.memberName || item.memberEmail}</strong>
                    <div className="small muted">{item.memberEmail}</div>
                  </td>
                  <td>{item.sourceType}</td>
                  <td>{item.className ?? "—"}</td>
                  <td className="nowrap small">{formatDateTime(item.startedAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Stat, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { addDaysIso, formatDateTime, todayIso } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import type { ClassSessionDto, CoachMemberRelationshipDto } from "@/lib/types";

export default function CoachDashboardPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const today = todayIso();
  const isPersonalTrainer = user?.coachCategory !== "ClassInstructor";

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
      isPersonalTrainer
        ? api.get<CoachMemberRelationshipDto[]>(
            "/api/coach-member-relationships",
            { signal, query: { activeOnly: true } },
          )
        : Promise.resolve([]),
    [isPersonalTrainer],
  );

  const todaySessions =
    week.data?.filter((session) => session.startAtUtc.slice(0, 10) === today) ??
    [];

  return (
    <AppShell
      title={t.coach.dashboard.title.replace("{name}", user?.fullName ?? "")}
      description={t.coach.dashboard.subtitle}
      allow={["Coach"]}
    >
      <div className="grid grid--stats">
        <Stat
          label={t.coach.dashboard.statTodayLessons}
          value={todaySessions.length}
        />
        <Stat
          label={t.coach.dashboard.statUpcomingLessons}
          value={week.data?.length ?? 0}
        />
        {isPersonalTrainer && (
          <Stat
            label={t.coach.dashboard.statAssignedMembers}
            value={members.data?.length ?? 0}
            hint={t.coach.dashboard.statAssignedMembersHint}
          />
        )}
      </div>

      {isPersonalTrainer && (
        <div className="row">
          <Link className="btn" href="/coach/training-plans">
            {t.coach.dashboard.quickEditPlans}
          </Link>
          <Link className="btn btn--ghost" href="/coach/ai-suggestions">
            {t.coach.dashboard.quickAiSuggestions}
          </Link>
        </div>
      )}

      <Card title={t.coach.dashboard.scheduleTableTitle} bodyless>
        <AsyncSection
          state={week}
          emptyMessage={t.coach.dashboard.scheduleTableEmpty}
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                t.coach.dashboard.columnClass,
                t.coach.dashboard.columnTime,
                t.coach.dashboard.columnRoom,
                { text: t.coach.dashboard.columnRegistered, numeric: true },
                t.coach.dashboard.columnStatus,
              ]}
            >
              {data.map((session) => (
                <tr key={session.sessionId}>
                  <td>
                    <strong>{session.className}</strong>
                    <div className="small muted">{session.discipline}</div>
                  </td>
                  <td className="nowrap">
                    {formatDateTime(session.startAtUtc)}
                  </td>
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

      {isPersonalTrainer && (
        <Card
          title={t.coach.dashboard.membersTableTitle}
          hint={t.coach.dashboard.membersTableHint}
          bodyless
        >
          <AsyncSection
            state={members}
            emptyMessage={t.coach.dashboard.membersTableEmpty}
            isEmpty={(data) => data.length === 0}
          >
            {(data) => (
              <Table
                headers={[
                  t.coach.dashboard.columnMember,
                  t.coach.dashboard.columnSource,
                  t.coach.dashboard.columnClass,
                  t.coach.dashboard.columnStart,
                ]}
              >
                {data.map((item) => (
                  <tr key={item.relationshipId}>
                    <td>
                      <strong>{item.memberName || item.memberEmail}</strong>
                      <div className="small muted">{item.memberEmail}</div>
                    </td>
                    <td>{item.sourceType}</td>
                    <td>{item.className ?? "—"}</td>
                    <td className="nowrap small">
                      {formatDateTime(item.startedAt)}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </AsyncSection>
        </Card>
      )}
    </AppShell>
  );
}

"use client";

import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { WorkoutPlanDto, WorkoutResultDto } from "@/lib/types";

/**
 * BR-25 — hội viên XEM kế hoạch tập, kết quả và nhận xét của HLV, nhưng KHÔNG sửa được.
 * Vì vậy trang này không có bất kỳ form ghi nào; backend cũng không mở endpoint ghi cho vai
 * trò Member.
 */
export default function MyTrainingPage() {
  const plans = useApi(
    (signal) =>
      api.get<WorkoutPlanDto[]>("/api/members/me/workout-plans", { signal }),
    [],
  );

  const results = useApi(
    (signal) =>
      api.get<WorkoutResultDto[]>("/api/members/me/workout-results", {
        signal,
      }),
    [],
  );

  return (
    <AppShell
      title="& Training Results"
      description="The contents are compiled by your coach"
      allow={["Member"]}
    >
      <Card
        title="Practice Plans"
        hint="Only the coach that is in charge you create and edit (BR-23, BR-25)."
      >
        <AsyncSection
          state={plans}
          emptyMessage="No album plans have been assigned to you."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <div className="stack">
              {data.map((plan) => (
                <div key={plan.planId} className="card">
                  <div className="card__head">
                    <div>
                      <h3>{plan.goal}</h3>
                      <p className="card__hint">
                        Level {label(plan.level)} · HLV {plan.coachName} . ›
                        Date {formatDateTime(plan.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Table
                    headers={[
                      "Trainings",
                      { text: "Round", numeric: true },
                      { text: "Number of times", numeric: true },
                      "Notes",
                    ]}
                  >
                    {plan.items.map((item) => (
                      <tr key={item.itemId}>
                        <td>{item.exercise}</td>
                        <td className="num">{item.sets}</td>
                        <td className="num">{item.reps}</td>
                        <td className="small muted">{item.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              ))}
            </div>
          )}
        </AsyncSection>
      </Card>

      <Card title="Results and Reviews in Time" bodyless>
        <AsyncSection
          state={results}
          emptyMessage="No episode results have been recorded."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Study",
                "Notes coach",
                "Progress",
                "Schedule",
                "Schedule",
              ]}
            >
              {data.map((item) => (
                <tr key={item.resultId}>
                  <td>
                    <strong>{item.className}</strong>
                    <div className="small muted">
                      {formatDateTime(item.sessionStartAtUtc)}
                    </div>
                  </td>
                  <td>{item.coachName}</td>
                  <td className="small">{item.progressNote ?? "—"}</td>
                  <td className="small">{item.coachComment ?? "—"}</td>
                  <td className="nowrap small muted">
                    {formatDateTime(item.recordedAt)}
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

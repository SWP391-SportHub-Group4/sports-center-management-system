"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type {
  CoachMemberRelationshipDto,
  MemberTrainingProfileDto,
  WorkoutResultDto,
} from "@/lib/types";

/**
 * Hội viên đang phụ trách và hồ sơ tập luyện của họ.
 * Endpoint /api/coach-member-relationships tự ép coachId về người đang đăng nhập, nên HLV
 * không đọc được danh sách của đồng nghiệp kể cả khi sửa tham số.
 */
export default function CoachMembersPage() {
  const [selected, setSelected] = useState<CoachMemberRelationshipDto | null>(
    null,
  );

  const relationships = useApi(
    (signal) =>
      api.get<CoachMemberRelationshipDto[]>("/api/coach-member-relationships", {
        signal,
        query: { activeOnly: true },
      }),
    [],
  );

  const profile = useApi(
    (signal) =>
      selected
        ? api.get<MemberTrainingProfileDto | null>(
            `/api/members/${selected.memberId}/training-profile`,
            { signal },
          )
        : Promise.resolve(null),
    [selected?.memberId],
  );

  const results = useApi(
    (signal) =>
      selected
        ? api.get<WorkoutResultDto[]>(
            `/api/members/${selected.memberId}/workout-results`,
            {
              signal,
            },
          )
        : Promise.resolve(null),
    [selected?.memberId],
  );

  return (
    <AppShell
      title="Fellow in charge."
      description="Practice record and membership history you're training"
      allow={["Coach"]}
    >
      <Card title="member list" bodyless>
        <AsyncSection
          state={relationships}
          emptyMessage="You've never been in charge of any member."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Members",
                "The Source of Relationships",
                "Class",
                "Start",
                "",
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
                  <td className="right">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setSelected(item)}
                    >
                      View Profile
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>

      {selected && (
        <>
          <Card
            title={`Training profile — ${selected.memberName || selected.memberEmail}`}
          >
            <AsyncSection
              state={profile}
              emptyMessage="The members haven't filed their training records yet."
            >
              {(data) =>
                data ? (
                  <div className="stack">
                    <div>
                      <strong>Target:</strong> {data.goal}
                    </div>
                    <div>
                      <strong>Level:</strong> {label(data.experienceLevel)}
                    </div>
                    <div>
                      <strong>Health Notes:</strong> {data.notes ?? "—"}
                    </div>
                    <div className="small muted">
                      Update {formatDateTime(data.updatedAt)}
                    </div>
                  </div>
                ) : (
                  <p className="muted">
                    Unreleased Fellows — No AI hint for This Person (BR-26).
                  </p>
                )
              }
            </AsyncSection>
          </Card>

          <Card title="Training Results History" bodyless>
            <AsyncSection
              state={results}
              emptyMessage="No episode results have been recorded."
              isEmpty={(data) => !data || data.length === 0}
            >
              {(data) =>
                data ? (
                  <Table
                    headers={[
                      "Study",
                      "HLV",
                      "Progress",
                      "Schedule",
                      "Write at",
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
                        <td className="small">{item.coachName}</td>
                        <td className="small">{item.progressNote ?? "—"}</td>
                        <td className="small">{item.coachComment ?? "—"}</td>
                        <td className="nowrap small muted">
                          {formatDateTime(item.recordedAt)}
                        </td>
                      </tr>
                    ))}
                  </Table>
                ) : null
              }
            </AsyncSection>
          </Card>
        </>
      )}
    </AppShell>
  );
}

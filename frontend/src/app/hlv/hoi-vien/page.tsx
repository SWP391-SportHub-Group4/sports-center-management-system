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
  const [selected, setSelected] = useState<CoachMemberRelationshipDto | null>(null);

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
        ? api.get<WorkoutResultDto[]>(`/api/members/${selected.memberId}/workout-results`, {
            signal,
          })
        : Promise.resolve(null),
    [selected?.memberId],
  );

  return (
    <AppShell
      title="Hội viên phụ trách"
      description="Hồ sơ tập luyện và lịch sử kết quả của hội viên bạn đang huấn luyện"
      allow={["Coach"]}
    >
      <Card title="Danh sách hội viên" bodyless>
        <AsyncSection
          state={relationships}
          emptyMessage="Bạn chưa phụ trách hội viên nào."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table headers={["Hội viên", "Nguồn quan hệ", "Lớp", "Bắt đầu", ""]}>
              {data.map((item) => (
                <tr key={item.relationshipId}>
                  <td>
                    <strong>{item.memberName || item.memberEmail}</strong>
                    <div className="small muted">{item.memberEmail}</div>
                  </td>
                  <td>{item.sourceType}</td>
                  <td>{item.className ?? "—"}</td>
                  <td className="nowrap small">{formatDateTime(item.startedAt)}</td>
                  <td className="right">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setSelected(item)}
                    >
                      Xem hồ sơ
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
          <Card title={`Hồ sơ tập luyện — ${selected.memberName || selected.memberEmail}`}>
            <AsyncSection state={profile} emptyMessage="Hội viên chưa khai hồ sơ tập luyện.">
              {(data) =>
                data ? (
                  <div className="stack">
                    <div>
                      <strong>Mục tiêu:</strong> {data.goal}
                    </div>
                    <div>
                      <strong>Trình độ:</strong> {label(data.experienceLevel)}
                    </div>
                    <div>
                      <strong>Ghi chú sức khỏe:</strong> {data.notes ?? "—"}
                    </div>
                    <div className="small muted">
                      Cập nhật {formatDateTime(data.updatedAt)}
                    </div>
                  </div>
                ) : (
                  <p className="muted">
                    Hội viên chưa khai hồ sơ — chưa xin được gợi ý AI cho người này (BR-26).
                  </p>
                )
              }
            </AsyncSection>
          </Card>

          <Card title="Lịch sử kết quả tập" bodyless>
            <AsyncSection
              state={results}
              emptyMessage="Chưa có kết quả tập nào được ghi nhận."
              isEmpty={(data) => !data || data.length === 0}
            >
              {(data) =>
                data ? (
                  <Table headers={["Buổi học", "HLV", "Tiến độ", "Nhận xét", "Ghi lúc"]}>
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

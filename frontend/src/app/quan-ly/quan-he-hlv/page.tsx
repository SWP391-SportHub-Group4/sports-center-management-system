"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MemberPicker } from "@/components/MemberPicker";
import { AsyncSection, Card, Feedback, Field, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { CoachMemberRelationshipDto, Paged, UserAdminDto } from "@/lib/types";

/**
 * Phân công huấn luyện viên cho hội viên.
 *
 * Ai được tạo/kết thúc quan hệ KHÔNG có BR trực tiếp — quyết định C3 trong
 * docs/implementation-decisions.md đặt quyền này ở Quản lý Trung tâm (CẦN DUYỆT), khớp tinh
 * thần BR-14. Coach KHÔNG tự tạo quan hệ với hội viên bất kỳ vì đó là tự cấp cho mình quyền
 * đọc hồ sơ và ghi kế hoạch tập.
 *
 * Quan hệ loại ClassBased do hệ thống tự sinh khi hội viên đăng ký lớp của HLV — không tạo tay.
 */
export default function CoachAssignmentPage() {
  const [member, setMember] = useState<UserAdminDto | null>(null);
  const [coachId, setCoachId] = useState("");
  const [sourceType, setSourceType] = useState("AssignedByManager");
  const [note, setNote] = useState("");
  const [filterCoachId, setFilterCoachId] = useState("");
  const action = useAction();

  const coaches = useApi(
    (signal) =>
      api.get<Paged<UserAdminDto>>("/api/users", {
        signal,
        query: { role: "Coach", pageSize: 100 },
      }),
    [],
  );

  const relationships = useApi(
    (signal) =>
      api.get<CoachMemberRelationshipDto[]>("/api/coach-member-relationships", {
        signal,
        query: { activeOnly: false, coachId: filterCoachId || undefined },
      }),
    [filterCoachId],
  );

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!member) return;

    const done = await action.run(
      () =>
        api.post("/api/coach-member-relationships", {
          coachId,
          memberId: member.userId,
          sourceType,
          note: note.trim() || null,
        }),
      "Đã tạo quan hệ huấn luyện.",
    );

    if (done !== null) {
      setMember(null);
      setNote("");
      relationships.reload();
    }
  };

  const end = async (item: CoachMemberRelationshipDto) => {
    const reason = window.prompt("Lý do kết thúc quan hệ huấn luyện:");
    if (!reason || reason.trim().length < 3) return;

    const done = await action.run(
      () =>
        api.post(`/api/coach-member-relationships/${item.relationshipId}/end`, {
          reason: reason.trim(),
        }),
      "Đã kết thúc quan hệ. Kế hoạch tập đã lập vẫn được giữ lại.",
    );

    if (done !== null) relationships.reload();
  };

  return (
    <AppShell
      title="Phân công huấn luyện viên"
      description="Quan hệ huấn luyện quyết định ai được lập kế hoạch tập cho hội viên (BR-23)"
      allow={["CenterManager"]}
    >
      <Card title="Tạo quan hệ mới">
        <form className="form" onSubmit={create} style={{ maxWidth: 700 }}>
          <MemberPicker value={member} onChange={setMember} />

          <div className="form form--inline">
            <Field label="Huấn luyện viên">
              <select
                value={coachId}
                required
                onChange={(event) => setCoachId(event.target.value)}
              >
                <option value="">— Chọn HLV —</option>
                {(coaches.data?.items ?? []).map((coach) => (
                  <option key={coach.userId} value={coach.userId}>
                    {coach.fullName || coach.email}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Loại quan hệ"
              hint="ClassBased do hệ thống tự tạo khi hội viên đăng ký lớp — không chọn tay được."
            >
              <select
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value)}
              >
                <option value="AssignedByManager">Quản lý phân công</option>
                <option value="Personal">Huấn luyện cá nhân</option>
              </select>
            </Field>
          </div>

          <Field label="Ghi chú (không bắt buộc)">
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>

          <Feedback error={action.error} success={action.success} />

          <div>
            <button type="submit" className="btn" disabled={!member || !coachId || action.busy}>
              {action.busy ? "Đang lưu…" : "Tạo quan hệ"}
            </button>
          </div>
        </form>
      </Card>

      <Card title="Danh sách quan hệ">
        <div className="form form--inline">
          <Field label="Lọc theo HLV">
            <select
              value={filterCoachId}
              onChange={(event) => setFilterCoachId(event.target.value)}
            >
              <option value="">Tất cả HLV</option>
              {(coaches.data?.items ?? []).map((coach) => (
                <option key={coach.userId} value={coach.userId}>
                  {coach.fullName || coach.email}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card bodyless>
        <AsyncSection
          state={relationships}
          emptyMessage="Chưa có quan hệ huấn luyện nào."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={["Huấn luyện viên", "Hội viên", "Nguồn", "Lớp", "Bắt đầu", "Trạng thái", ""]}
            >
              {data.map((item) => (
                <tr key={item.relationshipId}>
                  <td>{item.coachName}</td>
                  <td>
                    {item.memberName || item.memberEmail}
                    <div className="small muted">{item.memberEmail}</div>
                  </td>
                  <td className="small">{item.sourceType}</td>
                  <td className="small">{item.className ?? "—"}</td>
                  <td className="nowrap small">{formatDateTime(item.startedAt)}</td>
                  <td>
                    <StatusChip value={item.status} />
                  </td>
                  <td className="right">
                    {item.status === "Active" && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={action.busy}
                        onClick={() => void end(item)}
                      >
                        Kết thúc
                      </button>
                    )}
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

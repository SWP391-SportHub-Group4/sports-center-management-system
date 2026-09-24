"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MemberPicker } from "@/components/MemberPicker";
import {
  AsyncSection,
  Card,
  Feedback,
  Field,
  StatusChip,
  Table,
} from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type {
  CoachMemberRelationshipDto,
  Paged,
  UserAdminDto,
} from "@/lib/types";

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
      "The training relationship has been created.",
    );

    if (done !== null) {
      setMember(null);
      setNote("");
      relationships.reload();
    }
  };

  const end = async (item: CoachMemberRelationshipDto) => {
    const reason = window.prompt("Reason to end training relations:");
    if (!reason || reason.trim().length < 3) return;

    const done = await action.run(
      () =>
        api.post(`/api/coach-member-relationships/${item.relationshipId}/end`, {
          reason: reason.trim(),
        }),
      "The training plan was set to remain.",
    );

    if (done !== null) relationships.reload();
  };

  return (
    <AppShell
      title="Trained Coach"
      description="The training relationship decides who is planned to train members (BR-23)"
      allow={["CenterManager"]}
    >
      <Card title="Create a New Relationship">
        <form className="form" onSubmit={create} style={{ maxWidth: 700 }}>
          <MemberPicker value={member} onChange={setMember} />

          <div className="form form--inline">
            <Field label="Coach">
              <select
                value={coachId}
                required
                onChange={(event) => setCoachId(event.target.value)}
              >
                <option value="">— Select Coach —</option>
                {(coaches.data?.items ?? []).map((coach) => (
                  <option key={coach.userId} value={coach.userId}>
                    {coach.fullName || coach.email}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="The Kind of Relationships"
              hint="ClassBased was made by the self-made system when the membership enrolled the class — no hand-picking."
            >
              <select
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value)}
              >
                <option value="AssignedByManager">
                  Coordination Management
                </option>
                <option value="Personal">Personal Training</option>
              </select>
            </Field>
          </div>

          <Field label="Notes (non-requisition)">
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          <Feedback error={action.error} success={action.success} />

          <div>
            <button
              type="submit"
              className="btn"
              disabled={!member || !coachId || action.busy}
            >
              {action.busy ? "Saving..." : "Create Relationships"}
            </button>
          </div>
        </form>
      </Card>

      <Card title="Name">
        <div className="form form--inline">
          <Field label="Filter on Coach">
            <select
              value={filterCoachId}
              onChange={(event) => setFilterCoachId(event.target.value)}
            >
              <option value="">All Coaches.</option>
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
          emptyMessage="No training relationship yet."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Coach",
                "Members",
                "Source",
                "Class",
                "Start",
                "Status",
                "",
              ]}
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
                  <td className="nowrap small">
                    {formatDateTime(item.startedAt)}
                  </td>
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
                        Finish
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

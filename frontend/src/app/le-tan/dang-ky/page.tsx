"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MemberPicker } from "@/components/MemberPicker";
import { AsyncSection, Card, Feedback, Field, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { addDaysIso, formatDateTime, formatTime, todayIso } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type {
  ClassSessionDto,
  EnrollmentDto,
  MemberPackageDto,
  UserAdminDto,
} from "@/lib/types";

/**
 * Đăng ký lớp hộ hội viên — BR-17 cho phép Lễ tân hủy; việc đăng ký hộ dùng chung API với
 * hội viên tự đăng ký, chỉ khác ở chỗ memberId được truyền tường minh (và chỉ vai trò quầy
 * mới được phép truyền memberId của người khác).
 */
export default function AssistEnrollmentPage() {
  const [member, setMember] = useState<UserAdminDto | null>(null);
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(addDaysIso(todayIso(), 6));
  const action = useAction();

  const sessions = useApi(
    (signal) =>
      api.get<ClassSessionDto[]>("/api/class-sessions", {
        signal,
        query: { fromDate, toDate },
      }),
    [fromDate, toDate],
  );

  const enrollments = useApi(
    (signal) =>
      member
        ? api.get<EnrollmentDto[]>(`/api/members/${member.userId}/enrollments`, {
            signal,
            query: { upcomingOnly: true },
          })
        : Promise.resolve(null),
    [member?.userId],
  );

  const packages = useApi(
    (signal) =>
      member
        ? api.get<MemberPackageDto[]>(`/api/members/${member.userId}/packages`, { signal })
        : Promise.resolve(null),
    [member?.userId],
  );

  const usable = packages.data?.filter((item) => item.isUsable) ?? [];

  const enroll = async (sessionId: string) => {
    if (!member) return;

    const done = await action.run(
      () => api.post("/api/enrollments", { sessionId, memberId: member.userId }),
      "Đã đăng ký hộ hội viên.",
    );

    if (done !== null) {
      sessions.reload();
      enrollments.reload();
      packages.reload();
    }
  };

  const cancel = async (enrollmentId: string) => {
    const done = await action.run(
      () => api.post(`/api/enrollments/${enrollmentId}/cancel`),
      "Đã hủy đăng ký. Hủy đúng hạn sẽ hoàn lượt tập cho hội viên (BR-18).",
    );

    if (done !== null) {
      sessions.reload();
      enrollments.reload();
      packages.reload();
    }
  };

  const enrolledSessionIds = new Set(
    (enrollments.data ?? [])
      .filter((item) => item.status === "Confirmed")
      .map((item) => item.sessionId),
  );

  return (
    <AppShell
      title="Đăng ký lớp hộ hội viên"
      description="Hỗ trợ hội viên đặt chỗ hoặc hủy đăng ký tại quầy"
      allow={["Receptionist", "CenterManager"]}
    >
      <Card title="Chọn hội viên">
        <div className="stack" style={{ maxWidth: 620 }}>
          <MemberPicker value={member} onChange={setMember} />

          {member && usable.length === 0 && !packages.loading && (
            <div className="alert alert--warn">
              Hội viên không có gói nào còn hiệu lực — hệ thống sẽ từ chối đăng ký (BR-16).
            </div>
          )}

          {member && usable.length > 0 && (
            <div className="alert alert--success">
              Gói dùng được:{" "}
              {usable
                .map(
                  (item) =>
                    `${item.packageName} (${
                      item.remainingSessions === null
                        ? "không giới hạn"
                        : `còn ${item.remainingSessions} buổi`
                    })`,
                )
                .join(", ")}
            </div>
          )}

          <Feedback error={action.error} success={action.success} />
        </div>
      </Card>

      {member && (
        <Card title="Đăng ký hiện tại của hội viên" bodyless>
          <AsyncSection
            state={enrollments}
            emptyMessage="Hội viên chưa có đăng ký nào sắp tới."
            isEmpty={(data) => !data || data.length === 0}
          >
            {(data) =>
              data ? (
                <Table headers={["Lớp", "Thời gian", "Hạn hủy", "Trạng thái", ""]}>
                  {data.map((item) => (
                    <tr key={item.enrollmentId}>
                      <td>{item.session.className}</td>
                      <td className="nowrap">{formatDateTime(item.session.startAtUtc)}</td>
                      <td className="nowrap small">
                        {formatDateTime(item.cancellationDeadlineUtc)}
                      </td>
                      <td>
                        <StatusChip value={item.status} />
                      </td>
                      <td className="right">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={action.busy}
                          onClick={() => void cancel(item.enrollmentId)}
                        >
                          Hủy
                        </button>
                      </td>
                    </tr>
                  ))}
                </Table>
              ) : null
            }
          </AsyncSection>
        </Card>
      )}

      <Card title="Buổi học có thể đăng ký">
        <div className="form form--inline">
          <Field label="Từ ngày">
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </Field>
          <Field label="Đến ngày">
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card bodyless>
        <AsyncSection
          state={sessions}
          emptyMessage="Không có buổi học nào trong khoảng này."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Lớp",
                "Thời gian",
                "Phòng",
                "HLV",
                { text: "Chỗ", numeric: true },
                "",
              ]}
            >
              {data
                .filter((session) => session.status === "Scheduled")
                .map((session) => (
                  <tr key={session.sessionId}>
                    <td>
                      <strong>{session.className}</strong>
                      <div className="small muted">{session.discipline}</div>
                    </td>
                    <td className="nowrap">
                      {formatDateTime(session.startAtUtc)}
                      <div className="small muted">đến {formatTime(session.endAtUtc)}</div>
                    </td>
                    <td>{session.roomName}</td>
                    <td>{session.coachName}</td>
                    <td className="num">
                      {session.confirmedCount}/{session.capacity}
                    </td>
                    <td className="right">
                      {enrolledSessionIds.has(session.sessionId) ? (
                        <span className="chip chip--ok">Đã đăng ký</span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={!member || action.busy || session.isFull}
                          onClick={() => void enroll(session.sessionId)}
                        >
                          {session.isFull ? "Đã đầy" : "Đăng ký hộ"}
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

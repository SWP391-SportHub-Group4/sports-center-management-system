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
        ? api.get<EnrollmentDto[]>(
            `/api/members/${member.userId}/enrollments`,
            {
              signal,
              query: { upcomingOnly: true },
            },
          )
        : Promise.resolve(null),
    [member?.userId],
  );

  const packages = useApi(
    (signal) =>
      member
        ? api.get<MemberPackageDto[]>(
            `/api/members/${member.userId}/packages`,
            { signal },
          )
        : Promise.resolve(null),
    [member?.userId],
  );

  const usable = packages.data?.filter((item) => item.isUsable) ?? [];

  const enroll = async (sessionId: string) => {
    if (!member) return;

    const done = await action.run(
      () =>
        api.post("/api/enrollments", { sessionId, memberId: member.userId }),
      "The membership is registered.",
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
      "Unregistered. cancels on time to complete the membership session (BR-18).",
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
      title="Subscription of the Fellowship Class"
      description="Fellow support sets or cancels the register at the counter"
      allow={["Receptionist", "CenterManager"]}
    >
      <Card title="Select Members">
        <div className="stack" style={{ maxWidth: 620 }}>
          <MemberPicker value={member} onChange={setMember} />

          {member && usable.length === 0 && !packages.loading && (
            <div className="alert alert--warn">
              The members have no packages that are still in effect — the system
              will refuse to register (BR-16).
            </div>
          )}

          {member && usable.length > 0 && (
            <div className="alert alert--success">
              Available Package:{" "}
              {usable
                .map(
                  (item) =>
                    `${item.packageName} (${
                      item.remainingSessions === null
                        ? "unlimited"
                        : ` remaining${item.remainingSessions} sessions`
                    })`,
                )
                .join(", ")}
            </div>
          )}

          <Feedback error={action.error} success={action.success} />
        </div>
      </Card>

      {member && (
        <Card title="Current Register of the Fellow" bodyless>
          <AsyncSection
            state={enrollments}
            emptyMessage="No registered members are coming up."
            isEmpty={(data) => !data || data.length === 0}
          >
            {(data) =>
              data ? (
                <Table headers={["Class", "Time", "Reschedule", "Status", ""]}>
                  {data.map((item) => (
                    <tr key={item.enrollmentId}>
                      <td>{item.session.className}</td>
                      <td className="nowrap">
                        {formatDateTime(item.session.startAtUtc)}
                      </td>
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
                          Abort
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

      <Card title="The Study Can Register">
        <div className="form form--inline">
          <Field label="From Day">
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </Field>
          <Field label="days">
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
          emptyMessage="There's no study session in this range."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Class",
                "Time",
                "Room",
                "HLV",
                { text: "Places", numeric: true },
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
                      <div className="small muted">
                        To {formatTime(session.endAtUtc)}
                      </div>
                    </td>
                    <td>{session.roomName}</td>
                    <td>{session.coachName}</td>
                    <td className="num">
                      {session.confirmedCount}/{session.capacity}
                    </td>
                    <td className="right">
                      {enrolledSessionIds.has(session.sessionId) ? (
                        <span className="chip chip--ok">Registered</span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={!member || action.busy || session.isFull}
                          onClick={() => void enroll(session.sessionId)}
                        >
                          {session.isFull ? "Full" : "Subscription."}
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

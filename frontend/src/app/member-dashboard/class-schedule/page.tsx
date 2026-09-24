"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  AsyncSection,
  Card,
  Feedback,
  Field,
  StatusChip,
  Table,
} from "@/components/ui";
import { api } from "@/lib/apiClient";
import {
  addDaysIso,
  formatDateTime,
  formatTime,
  label,
  todayIso,
} from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { MemberPackageDto, MemberSessionDto } from "@/lib/types";

const DISCIPLINES = [
  { value: "", label: "All Instruments" },
  { value: "Yoga", label: "Yoga" },
  { value: "GroupX", label: "Group X" },
  { value: "PersonalTraining", label: "Personal Training" },
];

/**
 * Đặt lịch lớp — BR-16 (gói phải còn hiệu lực), BR-13 (không vượt sức chứa),
 * BR-19 (không đăng ký trùng buổi), BR-50 (hạn hủy được chốt tại thời điểm đăng ký).
 *
 * Gym/Fitness KHÔNG xuất hiện ở đây: Gym ra vào tự do, điểm danh tại quầy qua Gym check-in
 * (BR-64) chứ không đặt lịch.
 */
export default function MemberSchedulePage() {
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(addDaysIso(todayIso(), 13));
  const [discipline, setDiscipline] = useState("");
  const [packageId, setPackageId] = useState("");

  const action = useAction();

  const sessions = useApi(
    (signal) =>
      api.get<MemberSessionDto[]>("/api/members/me/schedule", {
        signal,
        query: { fromDate, toDate, discipline: discipline || undefined },
      }),
    [fromDate, toDate, discipline],
  );

  const packages = useApi(
    (signal) =>
      api.get<MemberPackageDto[]>("/api/members/me/packages", { signal }),
    [],
  );

  const usablePackages = packages.data?.filter((item) => item.isUsable) ?? [];

  const enroll = async (sessionId: string) => {
    const done = await action.run(
      () =>
        api.post("/api/enrollments", {
          sessionId,
          memberPackageId: packageId || undefined,
        }),
      "Successfully Registered. The episode has been subtracted into your package.",
    );

    if (done !== null) {
      sessions.reload();
      packages.reload();
    }
  };

  const cancel = async (enrollmentId: string) => {
    const done = await action.run(
      () => api.post(`/api/enrollments/${enrollmentId}/cancel`),
      "Unlisted. If cancelled on time, the episode will be returned to package.",
    );

    if (done !== null) {
      sessions.reload();
      packages.reload();
    }
  };

  return (
    <AppShell
      title="Schedule"
      description="Yoga, Group X and Personal Training. Gym/Fitness out into the free, no need to set a schedule."
      allow={["Member"]}
    >
      <Card title="Filter">
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
          <Field label="Department">
            <select
              value={discipline}
              onChange={(event) => setDiscipline(event.target.value)}
            >
              {DISCIPLINES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Deleted to packages"
            hint="Leave the system empty so that the package selection system is almost expired."
          >
            <select
              value={packageId}
              onChange={(event) => setPackageId(event.target.value)}
            >
              <option value="">Autoselect</option>
              {usablePackages.map((item) => (
                <option key={item.memberPackageId} value={item.memberPackageId}>
                  {item.packageName}
                  {item.remainingSessions === null
                    ? "(Unlimited)"
                    : ` (${item.remainingSessions} sessions remaining)`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {usablePackages.length === 0 && !packages.loading && (
          <div className="alert alert--warn" style={{ marginTop: 12 }}>
            You do not have a member package which is still in effect, so you do
            not have a class registration (BR-16). The reception connection to
            purchase or extension packages.
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <Feedback error={action.error} success={action.success} />
        </div>
      </Card>

      <Card title="Study sessions in selected intervals" bodyless>
        <AsyncSection
          state={sessions}
          emptyMessage="There is no study session during this period."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Class",
                "Time",
                "Room",
                "HLV",
                { text: "Space", numeric: true },
                "State",
                "",
              ]}
            >
              {data.map(({ session, myEnrollmentId, myEnrollmentStatus }) => {
                const remaining = session.capacity - session.confirmedCount;

                return (
                  <tr key={session.sessionId}>
                    <td>
                      <strong>{session.className}</strong>
                      <div className="small muted">
                        {label(session.discipline)}
                      </div>
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
                      {remaining}/{session.capacity}
                    </td>
                    <td>
                      {myEnrollmentId ? (
                        <StatusChip value={myEnrollmentStatus} />
                      ) : session.isFull ? (
                        <span className="chip chip--danger">Full</span>
                      ) : (
                        <span className="chip chip--info">Available</span>
                      )}
                    </td>
                    <td className="right">
                      {myEnrollmentId ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={action.busy}
                          onClick={() => void cancel(myEnrollmentId)}
                        >
                          Reschedule
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={
                            action.busy ||
                            session.isFull ||
                            usablePackages.length === 0
                          }
                          onClick={() => void enroll(session.sessionId)}
                        >
                          Subscript
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </AsyncSection>
      </Card>
    </AppShell>
  );
}

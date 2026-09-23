"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Feedback, Field, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { addDaysIso, formatDateTime, formatTime, label, todayIso } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { MemberPackageDto, MemberSessionDto } from "@/lib/types";

const DISCIPLINES = [
  { value: "", label: "Tất cả bộ môn" },
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
    (signal) => api.get<MemberPackageDto[]>("/api/members/me/packages", { signal }),
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
      "Đăng ký thành công. Lượt tập đã được trừ vào gói của bạn.",
    );

    if (done !== null) {
      sessions.reload();
      packages.reload();
    }
  };

  const cancel = async (enrollmentId: string) => {
    const done = await action.run(
      () => api.post(`/api/enrollments/${enrollmentId}/cancel`),
      "Đã hủy đăng ký. Nếu hủy đúng hạn, lượt tập đã được hoàn lại gói.",
    );

    if (done !== null) {
      sessions.reload();
      packages.reload();
    }
  };

  return (
    <AppShell
      title="Lịch lớp & đặt chỗ"
      description="Yoga, Group X và Personal Training. Gym/Fitness ra vào tự do, không cần đặt lịch."
      allow={["Member"]}
    >
      <Card title="Bộ lọc">
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
          <Field label="Bộ môn">
            <select value={discipline} onChange={(event) => setDiscipline(event.target.value)}>
              {DISCIPLINES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Trừ vào gói"
            hint="Để trống để hệ thống chọn gói sắp hết hạn nhất."
          >
            <select value={packageId} onChange={(event) => setPackageId(event.target.value)}>
              <option value="">Tự động chọn</option>
              {usablePackages.map((item) => (
                <option key={item.memberPackageId} value={item.memberPackageId}>
                  {item.packageName}
                  {item.remainingSessions === null
                    ? " (không giới hạn)"
                    : ` (còn ${item.remainingSessions} buổi)`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {usablePackages.length === 0 && !packages.loading && (
          <div className="alert alert--warn" style={{ marginTop: 12 }}>
            Bạn chưa có gói thành viên nào còn hiệu lực nên chưa đăng ký lớp được (BR-16).
            Liên hệ quầy lễ tân để mua hoặc gia hạn gói.
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <Feedback error={action.error} success={action.success} />
        </div>
      </Card>

      <Card title="Các buổi học trong khoảng đã chọn" bodyless>
        <AsyncSection
          state={sessions}
          emptyMessage="Không có buổi học nào trong khoảng thời gian này."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Lớp",
                "Thời gian",
                "Phòng",
                "HLV",
                { text: "Chỗ trống", numeric: true },
                "Tình trạng",
                "",
              ]}
            >
              {data.map(({ session, myEnrollmentId, myEnrollmentStatus }) => {
                const remaining = session.capacity - session.confirmedCount;

                return (
                  <tr key={session.sessionId}>
                    <td>
                      <strong>{session.className}</strong>
                      <div className="small muted">{label(session.discipline)}</div>
                    </td>
                    <td className="nowrap">
                      {formatDateTime(session.startAtUtc)}
                      <div className="small muted">
                        đến {formatTime(session.endAtUtc)}
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
                        <span className="chip chip--danger">Đã đầy</span>
                      ) : (
                        <span className="chip chip--info">Còn chỗ</span>
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
                          Hủy đăng ký
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={action.busy || session.isFull || usablePackages.length === 0}
                          onClick={() => void enroll(session.sessionId)}
                        >
                          Đăng ký
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

"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Feedback, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useAction, useApi, useNow } from "@/lib/useApi";
import type { EnrollmentDto } from "@/lib/types";

/**
 * Lịch sử đăng ký của hội viên — BR-17 (hội viên tự hủy), BR-18 (hủy đúng hạn thì hoàn lượt),
 * BR-50 (hạn hủy đã được chốt tại thời điểm đăng ký, hiển thị ngay trên từng dòng).
 */
export default function MyEnrollmentsPage() {
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const action = useAction();

  const enrollments = useApi(
    (signal) =>
      api.get<EnrollmentDto[]>("/api/members/me/enrollments", {
        signal,
        query: { upcomingOnly },
      }),
    [upcomingOnly],
  );

  const cancel = async (enrollmentId: string) => {
    const done = await action.run(
      () => api.post(`/api/enrollments/${enrollmentId}/cancel`),
      "Đã hủy đăng ký.",
    );

    if (done !== null) enrollments.reload();
  };

  // Tự làm mới mỗi phút để nhãn "đã quá hạn hủy" đổi theo thời gian thật, không cần tải lại trang.
  const now = useNow();

  return (
    <AppShell
      title="Đăng ký của tôi"
      description="Theo dõi các buổi đã đặt, hạn hủy và kết quả điểm danh"
      allow={["Member"]}
    >
      <Card
        title="Danh sách đăng ký"
        hint="Hủy tại hoặc trước hạn hủy sẽ được hoàn lại lượt tập vào gói (BR-18)."
        actions={
          <label className="row small">
            <input
              type="checkbox"
              checked={upcomingOnly}
              style={{ width: "auto" }}
              onChange={(event) => setUpcomingOnly(event.target.checked)}
            />
            Chỉ hiện buổi sắp tới
          </label>
        }
        bodyless
      >
        <div style={{ padding: "0 18px" }}>
          <Feedback error={action.error} success={action.success} />
        </div>

        <AsyncSection
          state={enrollments}
          emptyMessage="Bạn chưa có đăng ký nào."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={["Lớp", "Thời gian học", "Trạng thái", "Hạn hủy", "Điểm danh", ""]}
            >
              {data.map((item) => {
                const started = new Date(item.session.startAtUtc).getTime() <= now;
                const deadlinePassed =
                  new Date(item.cancellationDeadlineUtc).getTime() <= now;

                return (
                  <tr key={item.enrollmentId}>
                    <td>
                      <strong>{item.session.className}</strong>
                      <div className="small muted">
                        {item.session.roomName} · {item.session.coachName}
                      </div>
                    </td>
                    <td className="nowrap">{formatDateTime(item.session.startAtUtc)}</td>
                    <td>
                      <StatusChip value={item.status} />
                    </td>
                    <td className="nowrap small">
                      {formatDateTime(item.cancellationDeadlineUtc)}
                      {item.status === "Confirmed" && !started && deadlinePassed && (
                        <div style={{ color: "var(--warn-700)" }}>
                          Đã quá hạn — hủy bây giờ sẽ không được hoàn buổi
                        </div>
                      )}
                    </td>
                    <td>
                      <StatusChip value={item.attendanceStatus} />
                    </td>
                    <td className="right">
                      {item.status === "Confirmed" && !started && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={action.busy}
                          onClick={() => void cancel(item.enrollmentId)}
                        >
                          Hủy đăng ký
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

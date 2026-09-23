"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Stat, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { addDaysIso, formatDateTime, todayIso } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import type { ClassSessionDto, CoachMemberRelationshipDto } from "@/lib/types";

export default function CoachDashboardPage() {
  const { user } = useAuth();
  const today = todayIso();

  const week = useApi(
    (signal) =>
      api.get<ClassSessionDto[]>("/api/class-sessions/mine", {
        signal,
        query: { fromDate: today, toDate: addDaysIso(today, 6) },
      }),
    [today],
  );

  const members = useApi(
    (signal) =>
      api.get<CoachMemberRelationshipDto[]>("/api/coach-member-relationships", {
        signal,
        query: { activeOnly: true },
      }),
    [],
  );

  const todaySessions =
    week.data?.filter((session) => session.startAtUtc.slice(0, 10) === today) ?? [];

  return (
    <AppShell
      title={`Xin chào, ${user?.fullName ?? "huấn luyện viên"}`}
      description="Lịch dạy, hội viên phụ trách và công cụ soạn kế hoạch tập"
      allow={["Coach"]}
    >
      <div className="grid grid--stats">
        <Stat label="Buổi dạy hôm nay" value={todaySessions.length} />
        <Stat label="Buổi dạy 7 ngày tới" value={week.data?.length ?? 0} />
        <Stat
          label="Hội viên đang phụ trách"
          value={members.data?.length ?? 0}
          hint="Quan hệ huấn luyện đang hoạt động (BR-23)"
        />
      </div>

      <div className="row">
        <Link className="btn" href="/hlv/diem-danh">
          Điểm danh & ghi kết quả
        </Link>
        <Link className="btn btn--ghost" href="/hlv/ke-hoach">
          Soạn kế hoạch tập
        </Link>
        <Link className="btn btn--ghost" href="/hlv/goi-y-ai">
          Xin gợi ý AI
        </Link>
      </div>

      <Card title="Lịch dạy 7 ngày tới" bodyless>
        <AsyncSection
          state={week}
          emptyMessage="Bạn chưa được phân công buổi dạy nào trong 7 ngày tới."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Lớp",
                "Thời gian",
                "Phòng",
                { text: "Đã đăng ký", numeric: true },
                "Trạng thái",
              ]}
            >
              {data.map((session) => (
                <tr key={session.sessionId}>
                  <td>
                    <strong>{session.className}</strong>
                    <div className="small muted">{session.discipline}</div>
                  </td>
                  <td className="nowrap">{formatDateTime(session.startAtUtc)}</td>
                  <td>{session.roomName}</td>
                  <td className="num">
                    {session.confirmedCount}/{session.capacity}
                  </td>
                  <td>
                    <StatusChip value={session.status} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>

      <Card
        title="Hội viên đang phụ trách"
        hint="Chỉ với những hội viên này bạn mới lập được kế hoạch tập và xin gợi ý AI (BR-23)."
        bodyless
      >
        <AsyncSection
          state={members}
          emptyMessage="Bạn chưa phụ trách hội viên nào. Quan hệ sẽ phát sinh khi hội viên đăng ký lớp của bạn, hoặc do Quản lý phân công."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table headers={["Hội viên", "Nguồn quan hệ", "Lớp", "Bắt đầu"]}>
              {data.map((item) => (
                <tr key={item.relationshipId}>
                  <td>
                    <strong>{item.memberName || item.memberEmail}</strong>
                    <div className="small muted">{item.memberEmail}</div>
                  </td>
                  <td>{item.sourceType}</td>
                  <td>{item.className ?? "—"}</td>
                  <td className="nowrap small">{formatDateTime(item.startedAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>
    </AppShell>
  );
}

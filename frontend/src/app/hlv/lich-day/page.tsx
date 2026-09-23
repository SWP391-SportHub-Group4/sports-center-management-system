"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Field, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { addDaysIso, formatDateTime, formatTime, todayIso } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { ClassSessionDto } from "@/lib/types";

export default function CoachSchedulePage() {
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(addDaysIso(todayIso(), 13));

  const sessions = useApi(
    (signal) =>
      api.get<ClassSessionDto[]>("/api/class-sessions/mine", {
        signal,
        query: { fromDate, toDate },
      }),
    [fromDate, toDate],
  );

  return (
    <AppShell
      title="Lịch dạy"
      description="Các buổi học bạn được phân công phụ trách"
      allow={["Coach"]}
    >
      <Card title="Khoảng thời gian">
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
          emptyMessage="Không có buổi dạy nào trong khoảng này."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Lớp",
                "Thời gian",
                "Phòng",
                { text: "Đã đăng ký", numeric: true },
                { text: "Sức chứa", numeric: true },
                "Trạng thái",
              ]}
            >
              {data.map((session) => (
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
                  <td className="num">{session.confirmedCount}</td>
                  <td className="num">
                    {session.capacity}
                    {session.capacity !== session.baselineCapacity && (
                      <div className="small muted">trần gốc {session.baselineCapacity}</div>
                    )}
                  </td>
                  <td>
                    <StatusChip value={session.status} />
                    {session.rescheduledFromSessionId && (
                      <div className="small muted">Buổi thay thế</div>
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

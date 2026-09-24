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
      title="Schedule"
      description="The Study You Are assigned to the Work"
      allow={["Coach"]}
    >
      <Card title="Time interval">
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
          emptyMessage="There's no teaching session in this range."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Class",
                "Time",
                "Room",
                { text: "Registered", numeric: true },
                { text: "Schedule", numeric: true },
                "Status",
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
                    <div className="small muted">To {formatTime(session.endAtUtc)}</div>
                  </td>
                  <td>{session.roomName}</td>
                  <td className="num">{session.confirmedCount}</td>
                  <td className="num">
                    {session.capacity}
                    {session.capacity !== session.baselineCapacity && (
                      <div className="small muted">Original ceiling {session.baselineCapacity}</div>
                    )}
                  </td>
                  <td>
                    <StatusChip value={session.status} />
                    {session.rescheduledFromSessionId && (
                      <div className="small muted">Replacement session</div>
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

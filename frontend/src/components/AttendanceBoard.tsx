"use client";

import { useState } from "react";
import {
  AsyncSection,
  Card,
  Feedback,
  Field,
  StatusChip,
  Table,
} from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime, formatTime, todayIso } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { ClassSessionDto, SessionRosterDto } from "@/lib/types";

/**
 * Bảng điểm danh — BR-22 (chỉ HLV được gán buổi đó hoặc Lễ tân), BR-53 (chỉ ghi tay
 * Present/Absent; No-show do tiến trình tự động sinh sau khi buổi kết thúc, BR-20).
 *
 * Vì vậy UI chỉ có hai nút Có mặt / Vắng — không có nút nào đặt No-show.
 */
export function AttendanceBoard({
  coachOnly,
  onResultRequested,
}: {
  /** true = chỉ liệt kê buổi của HLV đang đăng nhập. */
  coachOnly: boolean;
  /** Cho phép màn hình HLV mở form ghi kết quả tập ngay từ danh sách điểm danh. */
  onResultRequested?: (entry: {
    enrollmentId: string;
    memberName: string;
  }) => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const action = useAction();

  const sessions = useApi(
    (signal) =>
      api.get<ClassSessionDto[]>(
        coachOnly ? "/api/class-sessions/mine" : "/api/class-sessions",
        {
          signal,
          query: { fromDate: date, toDate: date },
        },
      ),
    [date, coachOnly],
  );

  const roster = useApi(
    (signal) =>
      sessionId
        ? api.get<SessionRosterDto>(`/api/class-sessions/${sessionId}/roster`, {
            signal,
          })
        : Promise.resolve(null),
    [sessionId],
  );

  const mark = async (enrollmentId: string, status: "Present" | "Absent") => {
    const done = await action.run(
      () => api.post(`/api/attendance/${enrollmentId}`, { status }),
      status === "Present" ? "Noted present." : "Noted.",
    );

    if (done !== null) roster.reload();
  };

  return (
    <>
      <Card title="Select Study">
        <div className="form form--inline">
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setSessionId(null);
              }}
            />
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <AsyncSection
            state={sessions}
            emptyMessage="There is no study day."
            isEmpty={(data) => data.length === 0}
          >
            {(data) => (
              <div className="btn-row">
                {data.map((session) => (
                  <button
                    key={session.sessionId}
                    type="button"
                    className={`btn btn--sm ${sessionId === session.sessionId ? "" : "btn--ghost"}`}
                    onClick={() => setSessionId(session.sessionId)}
                  >
                    {session.className} · {formatTime(session.startAtUtc)} ·{" "}
                    {session.confirmedCount}/{session.capacity}
                  </button>
                ))}
              </div>
            )}
          </AsyncSection>
        </div>
      </Card>

      {sessionId && (
        <Card
          title="List"
          hint="Only noted Present or Zagreb. Status No comes due to self-record system after the end of the session (BR-20, BR-53)."
          bodyless
        >
          <div style={{ padding: "0 18px" }}>
            <Feedback error={action.error} success={action.success} />
          </div>

          <AsyncSection
            state={roster}
            emptyMessage="This study is not registered."
            isEmpty={(data) => !data || data.entries.length === 0}
          >
            {(data) =>
              data ? (
                <>
                  <div
                    style={{ padding: "0 18px 10px" }}
                    className="small muted"
                  >
                    {data.session.className} ·{" "}
                    {formatDateTime(data.session.startAtUtc)} ·{" "}
                    {data.session.roomName} · HLV {data.session.coachName}
                  </div>

                  <Table
                    headers={[
                      "Members",
                      "Subscript",
                      "Score",
                      "Check-in Time",
                      "",
                    ]}
                  >
                    {data.entries.map((entry) => (
                      <tr key={entry.enrollmentId}>
                        <td>
                          <strong>
                            {entry.memberName || entry.memberEmail}
                          </strong>
                          <div className="small muted">{entry.memberEmail}</div>
                        </td>
                        <td>
                          <StatusChip value={entry.enrollmentStatus} />
                        </td>
                        <td>
                          <StatusChip value={entry.attendanceStatus} />
                        </td>
                        <td className="small nowrap">
                          {entry.checkInTime
                            ? formatDateTime(entry.checkInTime)
                            : "—"}
                        </td>
                        <td className="right">
                          {entry.enrollmentStatus === "Confirmed" ? (
                            <div
                              className="btn-row"
                              style={{ justifyContent: "flex-end" }}
                            >
                              <button
                                type="button"
                                className="btn btn--sm"
                                disabled={action.busy}
                                onClick={() =>
                                  void mark(entry.enrollmentId, "Present")
                                }
                              >
                                Present
                              </button>
                              <button
                                type="button"
                                className="btn btn--sm btn--ghost"
                                disabled={action.busy}
                                onClick={() =>
                                  void mark(entry.enrollmentId, "Absent")
                                }
                              >
                                Empaine
                              </button>
                              {onResultRequested && (
                                <button
                                  type="button"
                                  className="btn btn--sm btn--ghost"
                                  onClick={() =>
                                    onResultRequested({
                                      enrollmentId: entry.enrollmentId,
                                      memberName:
                                        entry.memberName || entry.memberEmail,
                                    })
                                  }
                                >
                                  Write Results
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="small muted">Reschedule</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                </>
              ) : null
            }
          </AsyncSection>
        </Card>
      )}
    </>
  );
}

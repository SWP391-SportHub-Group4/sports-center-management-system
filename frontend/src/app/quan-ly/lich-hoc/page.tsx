"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Dialog, Feedback, Field, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import {
  addDaysIso,
  formatDateTime,
  formatTime,
  todayIso,
  vietnamLocalToUtcIso,
} from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { ClassSessionDto, RoomDto, SessionRosterDto } from "@/lib/types";

/**
 * Lịch học — BR-51 (chỉ được GIẢM sức chứa của một buổi, không vượt trần chốt lúc tạo) và
 * BR-54 (hủy/dời buổi chưa bắt đầu: hủy đăng ký, hoàn lượt, không phạt; dời thì tạo buổi
 * thay thế có liên kết và hội viên phải tự đăng ký lại).
 */
export default function SchedulePage() {
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(addDaysIso(todayIso(), 13));
  const [cancelTarget, setCancelTarget] = useState<ClassSessionDto | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<ClassSessionDto | null>(null);
  const [editTarget, setEditTarget] = useState<ClassSessionDto | null>(null);
  const [rosterTarget, setRosterTarget] = useState<ClassSessionDto | null>(null);

  const [reason, setReason] = useState("");
  const [reschedule, setReschedule] = useState({ date: todayIso(), start: "18:00", end: "19:00" });
  const [editForm, setEditForm] = useState({ roomId: "", capacity: "" });

  const action = useAction();

  const sessions = useApi(
    (signal) =>
      api.get<ClassSessionDto[]>("/api/class-sessions", {
        signal,
        query: { fromDate, toDate, includeCancelled: true },
      }),
    [fromDate, toDate],
  );

  const rooms = useApi((signal) => api.get<RoomDto[]>("/api/rooms", { signal }), []);

  const roster = useApi(
    (signal) =>
      rosterTarget
        ? api.get<SessionRosterDto>(`/api/class-sessions/${rosterTarget.sessionId}/roster`, {
            signal,
          })
        : Promise.resolve(null),
    [rosterTarget?.sessionId],
  );

  const doCancel = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cancelTarget) return;

    const done = await action.run(
      () =>
        api.post(`/api/class-sessions/${cancelTarget.sessionId}/cancel`, {
          reason: reason.trim(),
        }),
      "Đã hủy buổi học. Các đăng ký đã được hủy, lượt tập đã hoàn và hội viên đã nhận thông báo.",
    );

    if (done !== null) {
      setCancelTarget(null);
      setReason("");
      sessions.reload();
    }
  };

  const doReschedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rescheduleTarget) return;

    const done = await action.run(
      () =>
        api.post(`/api/class-sessions/${rescheduleTarget.sessionId}/reschedule`, {
          newStartAtUtc: vietnamLocalToUtcIso(reschedule.date, reschedule.start),
          newEndAtUtc: vietnamLocalToUtcIso(reschedule.date, reschedule.end),
          reason: reason.trim(),
        }),
      "Đã tạo buổi thay thế. Hội viên cần chủ động đăng ký lại (BR-54).",
    );

    if (done !== null) {
      setRescheduleTarget(null);
      setReason("");
      sessions.reload();
    }
  };

  const doEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editTarget) return;

    const done = await action.run(
      () =>
        api.put(`/api/class-sessions/${editTarget.sessionId}`, {
          roomId: editForm.roomId ? Number(editForm.roomId) : null,
          capacity: editForm.capacity ? Number(editForm.capacity) : null,
        }),
      "Đã cập nhật buổi học.",
    );

    if (done !== null) {
      setEditTarget(null);
      sessions.reload();
    }
  };

  return (
    <AppShell
      title="Lịch học"
      description="Theo dõi, sửa, hủy và dời các buổi học đã lên lịch"
      allow={["CenterManager"]}
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

        <div style={{ marginTop: 12 }}>
          <Feedback error={action.error} success={action.success} />
        </div>
      </Card>

      <Card title="Buổi học" bodyless>
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
                { text: "Đăng ký", numeric: true },
                { text: "Sức chứa", numeric: true },
                "Trạng thái",
                "",
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
                  <td>{session.coachName}</td>
                  <td className="num">{session.confirmedCount}</td>
                  <td className="num">
                    {session.capacity}
                    <div className="small muted">trần {session.baselineCapacity}</div>
                  </td>
                  <td>
                    <StatusChip value={session.status} />
                    {session.rescheduledFromSessionId && (
                      <div className="small muted">Buổi thay thế</div>
                    )}
                  </td>
                  <td className="right">
                    <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setRosterTarget(session)}
                      >
                        Danh sách
                      </button>
                      {session.status === "Scheduled" && (
                        <>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              action.reset();
                              setEditTarget(session);
                              setEditForm({
                                roomId: String(session.roomId),
                                capacity: String(session.capacity),
                              });
                            }}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              action.reset();
                              setReason("");
                              setReschedule({
                                date: session.startAtUtc.slice(0, 10),
                                start: "18:00",
                                end: "19:00",
                              });
                              setRescheduleTarget(session);
                            }}
                          >
                            Dời lịch
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            onClick={() => {
                              action.reset();
                              setReason("");
                              setCancelTarget(session);
                            }}
                          >
                            Hủy buổi
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>

      {cancelTarget && (
        <Dialog
          title={`Hủy buổi học — ${cancelTarget.className}`}
          onClose={() => setCancelTarget(null)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setCancelTarget(null)}>
                Không hủy
              </button>
              <button type="submit" form="cancel-form" className="btn btn--danger" disabled={action.busy}>
                Xác nhận hủy buổi
              </button>
            </>
          }
        >
          <form id="cancel-form" className="form" onSubmit={doCancel}>
            <div className="alert alert--warn">
              {cancelTarget.confirmedCount} đăng ký sẽ bị hủy. Lượt tập được hoàn lại đầy đủ và
              KHÔNG áp dụng phạt hủy trễ (BR-54). Hội viên nhận thông báo nêu rõ cần tự đăng ký
              buổi khác.
            </div>

            <Field label="Lý do hủy (bắt buộc, được ghi vào nhật ký và thông báo)">
              <input
                value={reason}
                required
                minLength={3}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>

            <Feedback error={action.error} success={null} />
          </form>
        </Dialog>
      )}

      {rescheduleTarget && (
        <Dialog
          title={`Dời lịch — ${rescheduleTarget.className}`}
          onClose={() => setRescheduleTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setRescheduleTarget(null)}
              >
                Hủy
              </button>
              <button type="submit" form="reschedule-form" className="btn" disabled={action.busy}>
                Tạo buổi thay thế
              </button>
            </>
          }
        >
          <form id="reschedule-form" className="form" onSubmit={doReschedule}>
            <div className="alert alert--warn">
              Hệ thống tạo một buổi MỚI liên kết với buổi cũ; buổi cũ chuyển sang trạng thái Đã
              dời lịch. Đăng ký cũ bị hủy và hoàn lượt — hệ thống KHÔNG tự chuyển hội viên sang
              buổi mới (BR-54).
            </div>

            <div className="form form--inline">
              <Field label="Ngày mới">
                <input
                  type="date"
                  value={reschedule.date}
                  required
                  onChange={(event) =>
                    setReschedule({ ...reschedule, date: event.target.value })
                  }
                />
              </Field>
              <Field label="Giờ bắt đầu (giờ VN)">
                <input
                  type="time"
                  value={reschedule.start}
                  required
                  onChange={(event) =>
                    setReschedule({ ...reschedule, start: event.target.value })
                  }
                />
              </Field>
              <Field label="Giờ kết thúc (giờ VN)">
                <input
                  type="time"
                  value={reschedule.end}
                  required
                  onChange={(event) => setReschedule({ ...reschedule, end: event.target.value })}
                />
              </Field>
            </div>

            <Field label="Lý do dời lịch (bắt buộc)">
              <input
                value={reason}
                required
                minLength={3}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>

            <Feedback error={action.error} success={null} />
          </form>
        </Dialog>
      )}

      {editTarget && (
        <Dialog
          title={`Sửa buổi học — ${editTarget.className}`}
          onClose={() => setEditTarget(null)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setEditTarget(null)}>
                Hủy
              </button>
              <button type="submit" form="edit-session-form" className="btn" disabled={action.busy}>
                Lưu
              </button>
            </>
          }
        >
          <form id="edit-session-form" className="form" onSubmit={doEdit}>
            <Field label="Phòng tập">
              <select
                value={editForm.roomId}
                onChange={(event) => setEditForm({ ...editForm, roomId: event.target.value })}
              >
                {(rooms.data ?? []).map((room) => (
                  <option key={room.roomId} value={room.roomId}>
                    {room.name} (sức chứa {room.capacity})
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Sức chứa buổi học"
              hint={`Tối đa ${editTarget.baselineCapacity} — trần được chốt tại thời điểm tạo buổi và không tăng vượt được (BR-51). Đang có ${editTarget.confirmedCount} đăng ký.`}
            >
              <input
                type="number"
                min={Math.max(1, editTarget.confirmedCount)}
                max={editTarget.baselineCapacity}
                value={editForm.capacity}
                onChange={(event) => setEditForm({ ...editForm, capacity: event.target.value })}
              />
            </Field>

            <Feedback error={action.error} success={null} />
          </form>
        </Dialog>
      )}

      {rosterTarget && (
        <Dialog
          title={`Danh sách đăng ký — ${rosterTarget.className}`}
          onClose={() => setRosterTarget(null)}
        >
          <AsyncSection
            state={roster}
            emptyMessage="Buổi học này chưa có ai đăng ký."
            isEmpty={(data) => !data || data.entries.length === 0}
          >
            {(data) =>
              data ? (
                <Table headers={["Hội viên", "Đăng ký", "Điểm danh"]}>
                  {data.entries.map((entry) => (
                    <tr key={entry.enrollmentId}>
                      <td>
                        {entry.memberName || entry.memberEmail}
                        <div className="small muted">{entry.memberEmail}</div>
                      </td>
                      <td>
                        <StatusChip value={entry.enrollmentStatus} />
                      </td>
                      <td>
                        <StatusChip value={entry.attendanceStatus} />
                      </td>
                    </tr>
                  ))}
                </Table>
              ) : null
            }
          </AsyncSection>
        </Dialog>
      )}
    </AppShell>
  );
}

"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  AsyncSection,
  Card,
  Dialog,
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
  const [cancelTarget, setCancelTarget] = useState<ClassSessionDto | null>(
    null,
  );
  const [rescheduleTarget, setRescheduleTarget] =
    useState<ClassSessionDto | null>(null);
  const [editTarget, setEditTarget] = useState<ClassSessionDto | null>(null);
  const [rosterTarget, setRosterTarget] = useState<ClassSessionDto | null>(
    null,
  );

  const [reason, setReason] = useState("");
  const [reschedule, setReschedule] = useState({
    date: todayIso(),
    start: "18:00",
    end: "19:00",
  });
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

  const rooms = useApi(
    (signal) => api.get<RoomDto[]>("/api/rooms", { signal }),
    [],
  );

  const roster = useApi(
    (signal) =>
      rosterTarget
        ? api.get<SessionRosterDto>(
            `/api/class-sessions/${rosterTarget.sessionId}/roster`,
            {
              signal,
            },
          )
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
      "The enrollments were cancelled, the episodes were completed and the members received the notice.",
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
        api.post(
          `/api/class-sessions/${rescheduleTarget.sessionId}/reschedule`,
          {
            newStartAtUtc: vietnamLocalToUtcIso(
              reschedule.date,
              reschedule.start,
            ),
            newEndAtUtc: vietnamLocalToUtcIso(reschedule.date, reschedule.end),
            reason: reason.trim(),
          },
        ),
      "The club has created a replacement session. The Society needs to take the initiative to re-list (BR-54).",
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
      "The study's up to date.",
    );

    if (done !== null) {
      setEditTarget(null);
      sessions.reload();
    }
  };

  return (
    <AppShell
      title="Schedule"
      description="Monitor, fix, cancel and move scheduled sessions"
      allow={["CenterManager"]}
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

        <div style={{ marginTop: 12 }}>
          <Feedback error={action.error} success={action.success} />
        </div>
      </Card>

      <Card title="Study" bodyless>
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
                { text: "Subscript", numeric: true },
                { text: "Schedule", numeric: true },
                "Status",
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
                    <div className="small muted">
                      To {formatTime(session.endAtUtc)}
                    </div>
                  </td>
                  <td>{session.roomName}</td>
                  <td>{session.coachName}</td>
                  <td className="num">{session.confirmedCount}</td>
                  <td className="num">
                    {session.capacity}
                    <div className="small muted">
                      ceiling {session.baselineCapacity}
                    </div>
                  </td>
                  <td>
                    <StatusChip value={session.status} />
                    {session.rescheduledFromSessionId && (
                      <div className="small muted">Replacement session</div>
                    )}
                  </td>
                  <td className="right">
                    <div
                      className="btn-row"
                      style={{ justifyContent: "flex-end" }}
                    >
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setRosterTarget(session)}
                      >
                        List
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
                            Edit
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
                            Schedule
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
                            Cancel Session
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
          title={`Cancel class session — ${cancelTarget.className}`}
          onClose={() => setCancelTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setCancelTarget(null)}
              >
                Do not cancel
              </button>
              <button
                type="submit"
                form="cancel-form"
                className="btn btn--danger"
                disabled={action.busy}
              >
                Confirmed cancel.
              </button>
            </>
          }
        >
          <form id="cancel-form" className="form" onSubmit={doCancel}>
            <div className="alert alert--warn">
              {cancelTarget.confirmedCount} Registers will be cancelled. The
              episode is fully returned and does not apply the delay fine
              (BR-54). The member receives a clear announcement stating the need
              to register for another session.
            </div>

            <Field label="Reasons of Abortion (requiring, written in journals and notifications)">
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
          title={`Reschedule — ${rescheduleTarget.className}`}
          onClose={() => setRescheduleTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setRescheduleTarget(null)}
              >
                Abort
              </button>
              <button
                type="submit"
                form="reschedule-form"
                className="btn"
                disabled={action.busy}
              >
                Create a substitute session
              </button>
            </>
          }
        >
          <form id="reschedule-form" className="form" onSubmit={doReschedule}>
            <div className="alert alert--warn">
              The system creates a session associated with the old date; the old
              period turns to a calendar moved state. The old registration is
              cancelled and full-timed — the system does not automatically
              transfer its membership to the new (BR-54).
            </div>

            <div className="form form--inline">
              <Field label="Name">
                <input
                  type="date"
                  value={reschedule.date}
                  required
                  onChange={(event) =>
                    setReschedule({ ...reschedule, date: event.target.value })
                  }
                />
              </Field>
              <Field label="Time to Start (VN time)">
                <input
                  type="time"
                  value={reschedule.start}
                  required
                  onChange={(event) =>
                    setReschedule({ ...reschedule, start: event.target.value })
                  }
                />
              </Field>
              <Field label="Game over (VN time)">
                <input
                  type="time"
                  value={reschedule.end}
                  required
                  onChange={(event) =>
                    setReschedule({ ...reschedule, end: event.target.value })
                  }
                />
              </Field>
            </div>

            <Field label="The Reason to Move Calendar (Requisition)">
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
          title={`Edit class session — ${editTarget.className}`}
          onClose={() => setEditTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setEditTarget(null)}
              >
                Abort
              </button>
              <button
                type="submit"
                form="edit-session-form"
                className="btn"
                disabled={action.busy}
              >
                Sto
              </button>
            </>
          }
        >
          <form id="edit-session-form" className="form" onSubmit={doEdit}>
            <Field label="Episode room">
              <select
                value={editForm.roomId}
                onChange={(event) =>
                  setEditForm({ ...editForm, roomId: event.target.value })
                }
              >
                {(rooms.data ?? []).map((room) => (
                  <option key={room.roomId} value={room.roomId}>
                    {room.name} (Present) {room.capacity})
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Study capacity"
              hint={`Maximum ${editTarget.baselineCapacity} — capacity was fixed when the session was created and cannot be increased beyond that limit (BR-51). There are ${editTarget.confirmedCount} registrations.`}
            >
              <input
                type="number"
                min={Math.max(1, editTarget.confirmedCount)}
                max={editTarget.baselineCapacity}
                value={editForm.capacity}
                onChange={(event) =>
                  setEditForm({ ...editForm, capacity: event.target.value })
                }
              />
            </Field>

            <Feedback error={action.error} success={null} />
          </form>
        </Dialog>
      )}

      {rosterTarget && (
        <Dialog
          title={`Registration list — ${rosterTarget.className}`}
          onClose={() => setRosterTarget(null)}
        >
          <AsyncSection
            state={roster}
            emptyMessage="This study is not registered."
            isEmpty={(data) => !data || data.entries.length === 0}
          >
            {(data) =>
              data ? (
                <Table headers={["Members", "Subscript", "Score"]}>
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

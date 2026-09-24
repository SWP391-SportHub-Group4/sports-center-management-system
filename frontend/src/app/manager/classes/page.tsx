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
import { addDaysIso, label, todayIso } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { ClassDto, Paged, RoomDto, UserAdminDto } from "@/lib/types";

const DISCIPLINES = [
  { value: "Yoga", label: "Yoga" },
  { value: "GroupX", label: "Group X / Aerobic / HIIT" },
  {
    value: "PersonalTraining",
    label: "Personal Training (Pression always = 1)",
  },
];

const DAY_CODES = [
  { value: "MON", label: "T2" },
  { value: "TUE", label: "T3" },
  { value: "WED", label: "T4" },
  { value: "THU", label: "T5" },
  { value: "FRI", label: "T6" },
  { value: "SAT", label: "T7" },
  { value: "SUN", label: "CN" },
];

/**
 * Lớp học và mẫu lịch lặp — BR-12 (phải có Phòng + Bộ môn khi tạo; HLV gán sau cũng được),
 * BR-14 (chỉ Quản lý phân công HLV), BR-15 (buổi học thừa hưởng khung giờ từ mẫu lặp).
 *
 * Gym/Fitness không có trong danh sách bộ môn: Gym ra vào tự do, đi qua Gym check-in (BR-64).
 */
export default function ClassesPage() {
  const emptyForm = {
    name: "",
    discipline: "Yoga",
    defaultRoomId: "",
    defaultCoachId: "",
    capacity: "15",
  };

  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<ClassDto | null>(null);
  const [recurrenceTarget, setRecurrenceTarget] = useState<ClassDto | null>(
    null,
  );
  const [recurrence, setRecurrence] = useState({
    days: ["MON", "WED", "FRI"],
    start: "18:00",
    end: "19:00",
    from: todayIso(),
    to: "",
  });
  const [generateTarget, setGenerateTarget] = useState<ClassDto | null>(null);
  const [generateRange, setGenerateRange] = useState({
    from: todayIso(),
    to: addDaysIso(todayIso(), 27),
  });

  const action = useAction();

  const classes = useApi(
    (signal) =>
      api.get<ClassDto[]>("/api/classes", {
        signal,
        query: { includeArchived: true },
      }),
    [],
  );

  const rooms = useApi(
    (signal) => api.get<RoomDto[]>("/api/rooms", { signal }),
    [],
  );

  const coaches = useApi(
    (signal) =>
      api.get<Paged<UserAdminDto>>("/api/users", {
        signal,
        query: { role: "Coach", pageSize: 100 },
      }),
    [],
  );

  const isPersonalTraining = form.discipline === "PersonalTraining";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = {
      name: form.name.trim(),
      discipline: form.discipline,
      defaultRoomId: Number(form.defaultRoomId),
      defaultCoachId: form.defaultCoachId || null,
      // Personal Training luôn có sức chứa 1 (SSOT §1.1) — ép ở client để người dùng không
      // phải đoán, backend vẫn kiểm lại và DB có CHECK constraint.
      capacity: isPersonalTraining ? 1 : Number(form.capacity),
    };

    const done = await action.run(
      () =>
        editing
          ? api.put(`/api/classes/${editing.classId}`, payload)
          : api.post("/api/classes", payload),
      editing ? "Class update." : "Classified.",
    );

    if (done !== null) {
      setForm(emptyForm);
      setEditing(null);
      classes.reload();
    }
  };

  const toggleArchive = async (item: ClassDto) => {
    const done = await action.run(
      () =>
        api.post(
          `/api/classes/${item.classId}/${item.status === "Active" ? "archive" : "reactivate"}`,
        ),
      item.status === "Active" ? "Class Archived." : "Class reopened.",
    );

    if (done !== null) classes.reload();
  };

  const addRecurrence = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!recurrenceTarget) return;

    const done = await action.run(
      () =>
        api.post(`/api/classes/${recurrenceTarget.classId}/recurrences`, {
          daysOfWeek: recurrence.days.join(","),
          startTimeLocal: `${recurrence.start}:00`,
          endTimeLocal: `${recurrence.end}:00`,
          effectiveFrom: recurrence.from,
          effectiveTo: recurrence.to || null,
        }),
      "Added schedule pattern.",
    );

    if (done !== null) {
      setRecurrenceTarget(null);
      classes.reload();
    }
  };

  const deleteRecurrence = async (classId: number, recurrenceId: number) => {
    const done = await action.run(
      () => api.del(`/api/classes/${classId}/recurrences/${recurrenceId}`),
      "The births are still in place.",
    );

    if (done !== null) classes.reload();
  };

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!generateTarget) return;

    const created = await action.run<unknown[]>(
      () =>
        api.post(`/api/classes/${generateTarget.classId}/generate-sessions`, {
          fromDate: generateRange.from,
          toDate: generateRange.to,
        }),
      "It's a schedule.",
    );

    if (created !== null) {
      setGenerateTarget(null);
      classes.reload();
    }
  };

  return (
    <AppShell
      title="Classes"
      description="Departments, Rooms, Coachs, and Repetitive Patterns"
      allow={["CenterManager"]}
    >
      <Card title={editing ? `Edit class: ${editing.name}` : "Create Class"}>
        <form className="form" onSubmit={submit}>
          <div className="form form--inline">
            <Field label="Class Name">
              <input
                value={form.name}
                required
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </Field>

            <Field label="Department">
              <select
                value={form.discipline}
                onChange={(event) =>
                  setForm({
                    ...form,
                    discipline: event.target.value,
                    capacity:
                      event.target.value === "PersonalTraining"
                        ? "1"
                        : form.capacity,
                  })
                }
              >
                {DISCIPLINES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Episode room">
              <select
                value={form.defaultRoomId}
                required
                onChange={(event) =>
                  setForm({ ...form, defaultRoomId: event.target.value })
                }
              >
                <option value="">— Select a Room —</option>
                {(rooms.data ?? []).map((room) => (
                  <option key={room.roomId} value={room.roomId}>
                    {room.name} (Present) {room.capacity})
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Coach"
              hint="Could be left empty and assigned later (BR-12), but there must be before the birth."
            >
              <select
                value={form.defaultCoachId}
                onChange={(event) =>
                  setForm({ ...form, defaultCoachId: event.target.value })
                }
              >
                <option value="">— Undecided —</option>
                {(coaches.data?.items ?? []).map((coach) => (
                  <option key={coach.userId} value={coach.userId}>
                    {coach.fullName || coach.email}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Class Media">
              <input
                type="number"
                min={1}
                max={500}
                value={isPersonalTraining ? 1 : form.capacity}
                disabled={isPersonalTraining}
                onChange={(event) =>
                  setForm({ ...form, capacity: event.target.value })
                }
              />
            </Field>
          </div>

          <Feedback error={action.error} success={action.success} />

          <div className="btn-row">
            <button type="submit" className="btn" disabled={action.busy}>
              {editing ? "Can not open message" : "Create Class"}
            </button>
            {editing && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm);
                }}
              >
                Abort
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card title="Class List" bodyless>
        <AsyncSection
          state={classes}
          emptyMessage="No classes yet."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Class",
                "Department",
                "Room",
                "HLV",
                { text: "Schedule", numeric: true },
                "Schedule",
                "Status",
                "",
              ]}
            >
              {data.map((item) => (
                <tr key={item.classId}>
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td>{label(item.discipline)}</td>
                  <td>
                    {item.defaultRoomName}
                    <div className="small muted">Name {item.roomCapacity}</div>
                  </td>
                  <td>
                    {item.defaultCoachName ?? (
                      <span className="muted">Unsalted</span>
                    )}
                  </td>
                  <td className="num">{item.capacity}</td>
                  <td className="small">
                    {item.recurrences.length === 0 ? (
                      <span className="muted">Not yet</span>
                    ) : (
                      item.recurrences.map((r) => (
                        <div key={r.recurrenceId}>
                          {r.daysOfWeek} · {r.startTimeLocal.slice(0, 5)}–
                          {r.endTimeLocal.slice(0, 5)}{" "}
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() =>
                              void deleteRecurrence(
                                item.classId,
                                r.recurrenceId,
                              )
                            }
                          >
                            delete
                          </button>
                        </div>
                      ))
                    )}
                  </td>
                  <td>
                    <StatusChip value={item.status} />
                  </td>
                  <td className="right">
                    <div
                      className="btn-row"
                      style={{ justifyContent: "flex-end" }}
                    >
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          setEditing(item);
                          setForm({
                            name: item.name,
                            discipline: item.discipline,
                            defaultRoomId: String(item.defaultRoomId),
                            defaultCoachId: item.defaultCoachId ?? "",
                            capacity: String(item.capacity),
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setRecurrenceTarget(item)}
                      >
                        Schedule
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm"
                        disabled={
                          item.recurrences.length === 0 || !item.defaultCoachId
                        }
                        title={
                          !item.defaultCoachId
                            ? "Needs to appoint coaches before embassing"
                            : item.recurrences.length === 0
                              ? "You need at least one calendar pattern."
                              : undefined
                        }
                        onClick={() => setGenerateTarget(item)}
                      >
                        Reschedule
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => void toggleArchive(item)}
                      >
                        {item.status === "Active" ? "Archive" : "Reopen"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>

      {recurrenceTarget && (
        <Dialog
          title={`Recurring schedule — ${recurrenceTarget.name}`}
          onClose={() => setRecurrenceTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setRecurrenceTarget(null)}
              >
                Abort
              </button>
              <button
                type="submit"
                form="recurrence-form"
                className="btn"
                disabled={action.busy}
              >
                Add Template
              </button>
            </>
          }
        >
          <form id="recurrence-form" className="form" onSubmit={addRecurrence}>
            <Field label="Days of Week">
              <div className="btn-row">
                {DAY_CODES.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    className={`btn btn--sm ${recurrence.days.includes(day.value) ? "" : "btn--ghost"}`}
                    onClick={() =>
                      setRecurrence((current) => ({
                        ...current,
                        days: current.days.includes(day.value)
                          ? current.days.filter((d) => d !== day.value)
                          : [...current.days, day.value],
                      }))
                    }
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </Field>

            <div className="form form--inline">
              <Field label="Time to Start (VN time)">
                <input
                  type="time"
                  value={recurrence.start}
                  required
                  onChange={(event) =>
                    setRecurrence({ ...recurrence, start: event.target.value })
                  }
                />
              </Field>
              <Field label="Game over (VN time)">
                <input
                  type="time"
                  value={recurrence.end}
                  required
                  onChange={(event) =>
                    setRecurrence({ ...recurrence, end: event.target.value })
                  }
                />
              </Field>
            </div>

            <div className="form form--inline">
              <Field label="Word Effects">
                <input
                  type="date"
                  value={recurrence.from}
                  required
                  onChange={(event) =>
                    setRecurrence({ ...recurrence, from: event.target.value })
                  }
                />
              </Field>
              <Field label="Enables coming (for empty = non-limits)">
                <input
                  type="date"
                  value={recurrence.to}
                  onChange={(event) =>
                    setRecurrence({ ...recurrence, to: event.target.value })
                  }
                />
              </Field>
            </div>

            <Feedback error={action.error} success={null} />
          </form>
        </Dialog>
      )}

      {generateTarget && (
        <Dialog
          title={`Generate class sessions — ${generateTarget.name}`}
          onClose={() => setGenerateTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setGenerateTarget(null)}
              >
                Abort
              </button>
              <button
                type="submit"
                form="generate-form"
                className="btn"
                disabled={action.busy}
              >
                Reschedule
              </button>
            </>
          }
        >
          <form id="generate-form" className="form" onSubmit={generate}>
            <p className="small muted" style={{ margin: 0 }}>
              Class sessions are generated from recurring schedules (BR-15).
              Running this again for the same date range will not create
              duplicates; room and coach conflicts are skipped.
            </p>

            <div className="form form--inline">
              <Field label="From Day">
                <input
                  type="date"
                  value={generateRange.from}
                  required
                  onChange={(event) =>
                    setGenerateRange({
                      ...generateRange,
                      from: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="days">
                <input
                  type="date"
                  value={generateRange.to}
                  required
                  onChange={(event) =>
                    setGenerateRange({
                      ...generateRange,
                      to: event.target.value,
                    })
                  }
                />
              </Field>
            </div>

            <Feedback error={action.error} success={null} />
          </form>
        </Dialog>
      )}
    </AppShell>
  );
}

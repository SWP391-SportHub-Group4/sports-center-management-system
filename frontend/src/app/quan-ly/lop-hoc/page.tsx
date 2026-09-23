"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Dialog, Feedback, Field, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { addDaysIso, label, todayIso } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { ClassDto, Paged, RoomDto, UserAdminDto } from "@/lib/types";

const DISCIPLINES = [
  { value: "Yoga", label: "Yoga" },
  { value: "GroupX", label: "Group X / Aerobic / HIIT" },
  { value: "PersonalTraining", label: "Personal Training (sức chứa luôn = 1)" },
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
  const [recurrenceTarget, setRecurrenceTarget] = useState<ClassDto | null>(null);
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
      api.get<ClassDto[]>("/api/classes", { signal, query: { includeArchived: true } }),
    [],
  );

  const rooms = useApi((signal) => api.get<RoomDto[]>("/api/rooms", { signal }), []);

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
      editing ? "Đã cập nhật lớp học." : "Đã tạo lớp học.",
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
      item.status === "Active" ? "Đã lưu trữ lớp học." : "Đã mở lại lớp học.",
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
      "Đã thêm mẫu lịch lặp.",
    );

    if (done !== null) {
      setRecurrenceTarget(null);
      classes.reload();
    }
  };

  const deleteRecurrence = async (classId: number, recurrenceId: number) => {
    const done = await action.run(
      () => api.del(`/api/classes/${classId}/recurrences/${recurrenceId}`),
      "Đã xóa mẫu lịch lặp. Các buổi đã sinh vẫn giữ nguyên.",
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
      "Đã sinh lịch học.",
    );

    if (created !== null) {
      setGenerateTarget(null);
      classes.reload();
    }
  };

  return (
    <AppShell
      title="Lớp học"
      description="Bộ môn, phòng, huấn luyện viên và mẫu lịch lặp"
      allow={["CenterManager"]}
    >
      <Card title={editing ? `Sửa lớp: ${editing.name}` : "Tạo lớp học"}>
        <form className="form" onSubmit={submit}>
          <div className="form form--inline">
            <Field label="Tên lớp">
              <input
                value={form.name}
                required
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>

            <Field label="Bộ môn">
              <select
                value={form.discipline}
                onChange={(event) =>
                  setForm({
                    ...form,
                    discipline: event.target.value,
                    capacity: event.target.value === "PersonalTraining" ? "1" : form.capacity,
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

            <Field label="Phòng tập">
              <select
                value={form.defaultRoomId}
                required
                onChange={(event) => setForm({ ...form, defaultRoomId: event.target.value })}
              >
                <option value="">— Chọn phòng —</option>
                {(rooms.data ?? []).map((room) => (
                  <option key={room.roomId} value={room.roomId}>
                    {room.name} (sức chứa {room.capacity})
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Huấn luyện viên"
              hint="Có thể để trống và phân công sau (BR-12), nhưng phải có trước khi sinh lịch."
            >
              <select
                value={form.defaultCoachId}
                onChange={(event) => setForm({ ...form, defaultCoachId: event.target.value })}
              >
                <option value="">— Chưa phân công —</option>
                {(coaches.data?.items ?? []).map((coach) => (
                  <option key={coach.userId} value={coach.userId}>
                    {coach.fullName || coach.email}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Sức chứa lớp">
              <input
                type="number"
                min={1}
                max={500}
                value={isPersonalTraining ? 1 : form.capacity}
                disabled={isPersonalTraining}
                onChange={(event) => setForm({ ...form, capacity: event.target.value })}
              />
            </Field>
          </div>

          <Feedback error={action.error} success={action.success} />

          <div className="btn-row">
            <button type="submit" className="btn" disabled={action.busy}>
              {editing ? "Lưu thay đổi" : "Tạo lớp"}
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
                Hủy
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card title="Danh sách lớp" bodyless>
        <AsyncSection
          state={classes}
          emptyMessage="Chưa có lớp học nào."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Lớp",
                "Bộ môn",
                "Phòng",
                "HLV",
                { text: "Sức chứa", numeric: true },
                "Lịch lặp",
                "Trạng thái",
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
                    <div className="small muted">sức chứa {item.roomCapacity}</div>
                  </td>
                  <td>{item.defaultCoachName ?? <span className="muted">Chưa phân công</span>}</td>
                  <td className="num">{item.capacity}</td>
                  <td className="small">
                    {item.recurrences.length === 0 ? (
                      <span className="muted">Chưa có</span>
                    ) : (
                      item.recurrences.map((r) => (
                        <div key={r.recurrenceId}>
                          {r.daysOfWeek} · {r.startTimeLocal.slice(0, 5)}–
                          {r.endTimeLocal.slice(0, 5)}{" "}
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => void deleteRecurrence(item.classId, r.recurrenceId)}
                          >
                            xóa
                          </button>
                        </div>
                      ))
                    )}
                  </td>
                  <td>
                    <StatusChip value={item.status} />
                  </td>
                  <td className="right">
                    <div className="btn-row" style={{ justifyContent: "flex-end" }}>
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
                        Sửa
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setRecurrenceTarget(item)}
                      >
                        Thêm lịch lặp
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm"
                        disabled={item.recurrences.length === 0 || !item.defaultCoachId}
                        title={
                          !item.defaultCoachId
                            ? "Cần phân công HLV trước khi sinh lịch"
                            : item.recurrences.length === 0
                              ? "Cần có ít nhất một mẫu lịch lặp"
                              : undefined
                        }
                        onClick={() => setGenerateTarget(item)}
                      >
                        Sinh lịch
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => void toggleArchive(item)}
                      >
                        {item.status === "Active" ? "Lưu trữ" : "Mở lại"}
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
          title={`Mẫu lịch lặp — ${recurrenceTarget.name}`}
          onClose={() => setRecurrenceTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setRecurrenceTarget(null)}
              >
                Hủy
              </button>
              <button type="submit" form="recurrence-form" className="btn" disabled={action.busy}>
                Thêm mẫu
              </button>
            </>
          }
        >
          <form id="recurrence-form" className="form" onSubmit={addRecurrence}>
            <Field label="Các ngày trong tuần">
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
              <Field label="Giờ bắt đầu (giờ VN)">
                <input
                  type="time"
                  value={recurrence.start}
                  required
                  onChange={(event) =>
                    setRecurrence({ ...recurrence, start: event.target.value })
                  }
                />
              </Field>
              <Field label="Giờ kết thúc (giờ VN)">
                <input
                  type="time"
                  value={recurrence.end}
                  required
                  onChange={(event) => setRecurrence({ ...recurrence, end: event.target.value })}
                />
              </Field>
            </div>

            <div className="form form--inline">
              <Field label="Hiệu lực từ">
                <input
                  type="date"
                  value={recurrence.from}
                  required
                  onChange={(event) => setRecurrence({ ...recurrence, from: event.target.value })}
                />
              </Field>
              <Field label="Hiệu lực đến (để trống = không giới hạn)">
                <input
                  type="date"
                  value={recurrence.to}
                  onChange={(event) => setRecurrence({ ...recurrence, to: event.target.value })}
                />
              </Field>
            </div>

            <Feedback error={action.error} success={null} />
          </form>
        </Dialog>
      )}

      {generateTarget && (
        <Dialog
          title={`Sinh lịch học — ${generateTarget.name}`}
          onClose={() => setGenerateTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setGenerateTarget(null)}
              >
                Hủy
              </button>
              <button type="submit" form="generate-form" className="btn" disabled={action.busy}>
                Sinh lịch
              </button>
            </>
          }
        >
          <form id="generate-form" className="form" onSubmit={generate}>
            <p className="small muted" style={{ margin: 0 }}>
              Buổi học được sinh từ các mẫu lịch lặp của lớp (BR-15). Chạy lại cùng khoảng ngày
              sẽ không tạo buổi trùng; buổi trùng phòng hoặc trùng lịch HLV sẽ được bỏ qua.
            </p>

            <div className="form form--inline">
              <Field label="Từ ngày">
                <input
                  type="date"
                  value={generateRange.from}
                  required
                  onChange={(event) =>
                    setGenerateRange({ ...generateRange, from: event.target.value })
                  }
                />
              </Field>
              <Field label="Đến ngày">
                <input
                  type="date"
                  value={generateRange.to}
                  required
                  onChange={(event) =>
                    setGenerateRange({ ...generateRange, to: event.target.value })
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

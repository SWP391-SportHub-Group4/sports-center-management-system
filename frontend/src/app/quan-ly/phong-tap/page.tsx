"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Feedback, Field, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useAction, useApi } from "@/lib/useApi";
import type { RoomDto } from "@/lib/types";

/**
 * Phòng tập — BR-39 (chỉ Quản lý Trung tâm cấu hình), BR-57 (tên duy nhất toàn trung tâm).
 *
 * Tăng sức chứa phòng KHÔNG nới trần của các buổi học đã tạo: trần đó đã chốt tại thời điểm
 * tạo buổi (BR-51).
 */
export default function RoomsPage() {
  const [form, setForm] = useState({ name: "", capacity: "20" });
  const [editing, setEditing] = useState<RoomDto | null>(null);
  const action = useAction();

  const rooms = useApi((signal) => api.get<RoomDto[]>("/api/rooms", { signal }), []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = { name: form.name.trim(), capacity: Number(form.capacity) };

    const done = await action.run(
      () =>
        editing
          ? api.put(`/api/rooms/${editing.roomId}`, payload)
          : api.post("/api/rooms", payload),
      editing ? "Đã cập nhật phòng tập." : "Đã thêm phòng tập.",
    );

    if (done !== null) {
      setForm({ name: "", capacity: "20" });
      setEditing(null);
      rooms.reload();
    }
  };

  const remove = async (room: RoomDto) => {
    const done = await action.run(
      () => api.del(`/api/rooms/${room.roomId}`),
      "Đã xóa phòng tập.",
    );

    if (done !== null) rooms.reload();
  };

  return (
    <AppShell
      title="Phòng tập"
      description="Danh mục phòng và sức chứa vật lý"
      allow={["CenterManager"]}
    >
      <Card title={editing ? `Sửa phòng: ${editing.name}` : "Thêm phòng tập"}>
        <form className="form form--inline" onSubmit={submit}>
          <Field label="Tên phòng">
            <input
              value={form.name}
              required
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Sức chứa">
            <input
              type="number"
              min={1}
              max={500}
              value={form.capacity}
              required
              onChange={(event) => setForm({ ...form, capacity: event.target.value })}
            />
          </Field>
          <div className="btn-row">
            <button type="submit" className="btn" disabled={action.busy}>
              {editing ? "Lưu thay đổi" : "Thêm phòng"}
            </button>
            {editing && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setEditing(null);
                  setForm({ name: "", capacity: "20" });
                }}
              >
                Hủy
              </button>
            )}
          </div>
        </form>

        <div style={{ marginTop: 12 }}>
          <Feedback error={action.error} success={action.success} />
        </div>
      </Card>

      <Card title="Danh sách phòng" bodyless>
        <AsyncSection
          state={rooms}
          emptyMessage="Chưa có phòng tập nào."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Tên phòng",
                { text: "Sức chứa", numeric: true },
                { text: "Lớp đang dùng", numeric: true },
                "",
              ]}
            >
              {data.map((room) => (
                <tr key={room.roomId}>
                  <td>
                    <strong>{room.name}</strong>
                  </td>
                  <td className="num">{room.capacity}</td>
                  <td className="num">{room.activeClassCount}</td>
                  <td className="right">
                    <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          setEditing(room);
                          setForm({ name: room.name, capacity: String(room.capacity) });
                        }}
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        disabled={action.busy || room.activeClassCount > 0}
                        title={
                          room.activeClassCount > 0
                            ? "Phòng đang được lớp học tham chiếu"
                            : undefined
                        }
                        onClick={() => void remove(room)}
                      >
                        Xóa
                      </button>
                    </div>
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

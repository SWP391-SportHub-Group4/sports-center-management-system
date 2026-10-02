"use client";
import { Field } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import type { RoomDto } from "@/lib/types";
export function CourtFilters({
  date,
  days,
  roomId,
  rooms,
  onDate,
  onDays,
  onRoom,
}: {
  date: string;
  days: number;
  roomId: string;
  rooms: RoomDto[];
  onDate: (v: string) => void;
  onDays: (v: number) => void;
  onRoom: (v: string) => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  return (
    <div className="form-grid">
      <Field label={l.date}>
        <input
          required
          type="date"
          value={date}
          onChange={(e) => e.target.value && onDate(e.target.value)}
        />
      </Field>
      <Field label={l.courtSchedule}>
        <select value={days} onChange={(e) => onDays(Number(e.target.value))}>
          <option value={1}>{l.day}</option>
          <option value={7}>{l.week}</option>
        </select>
      </Field>
      <Field label={l.room}>
        <select value={roomId} onChange={(e) => onRoom(e.target.value)}>
          <option value="">{l.all}</option>
          {rooms.map((r) => (
            <option key={r.roomId} value={r.roomId}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

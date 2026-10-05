"use client";

import { Field } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import type { RoomDto } from "@/lib/types";

export function CourtFilters({
  date,
  roomId,
  rooms,
  onDate,
  onRoom,
}: {
  date: string;
  roomId: string;
  rooms: RoomDto[];
  onDate: (v: string) => void;
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
          onChange={(e) =>
            e.target.value &&
            onDate(e.target.value)
          }
        />
      </Field>

      <Field label={l.room}>
        <select
          value={roomId}
          onChange={(e) =>
            onRoom(e.target.value)
          }
        >
          <option value="">
            {l.all}
          </option>

          {rooms.map((room) => (
            <option
              key={room.roomId}
              value={room.roomId}
            >
              {room.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
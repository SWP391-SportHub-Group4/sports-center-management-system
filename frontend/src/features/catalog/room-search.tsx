"use client";
import { SearchSelect } from "@/components/SearchSelect";
import { useLanguage } from "@/lib/language";
import type { RoomDto } from "@/lib/types";
export function RoomSearch({
  rooms,
  value,
  onChange,
  required,
}: {
  rooms: RoomDto[];
  value: string;
  onChange: (value: string) => void;
  required: boolean;
}) {
  const { t } = useLanguage();
  return (
    <SearchSelect
      items={rooms.map((room) => ({
        value: String(room.roomId),
        label: room.name,
      }))}
      value={value}
      onChange={onChange}
      required={required}
      label={t.operations.room}
      placeholder={t.managerCatalog.searchRooms}
    />
  );
}

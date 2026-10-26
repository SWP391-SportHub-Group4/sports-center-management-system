"use client";
import { Field, AsyncSection } from "@/components/ui";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import { catalogApi } from "./api";
import type { RoomDto } from "@/lib/types";
import { InlineCreate } from "./inline-create";
export function RoomSelector({
  value,
  onChange,
  sportId,
  allowCreate = false,
  onCatalogChanged,
  onCourtCreated,
}: {
  allowCreate?: boolean;
  onCatalogChanged?: () => void;
  onCourtCreated?: (court: RoomDto) => void;
  value: string;
  onChange: (value: string) => void;
  sportId?: number;
}) {
  const { t } = useLanguage();
  const data = useApi(async (signal) => {
    const rooms = await catalogApi.rooms(signal);
    return rooms.filter((room) => room.isActive);
  }, []);
  return (
    <InlineCreate
      enabled={allowCreate}
      kind="court"
      sportId={sportId}
      onCreated={(created) => {
        data.reload();
        onChange(String(created.roomId));
        onCourtCreated?.(created);
        onCatalogChanged?.();
      }}
    >
      <AsyncSection state={data}>
        {(rooms) => (
          <Field
            label={t.operations.room}
            hint={
              <>
                {t.managerCatalog.roomPickerHint}{" "}
                <Link href="/manager/facilities">
                  {t.managerCatalog.manageRooms}
                </Link>
              </>
            }
          >
            <select value={value} onChange={(e) => onChange(e.target.value)}>
              <option value="">—</option>
              {rooms.map((r) => (
                <option key={r.roomId} value={r.roomId}>
                  {r.name} · {r.capacity}
                </option>
              ))}
            </select>
          </Field>
        )}
      </AsyncSection>
    </InlineCreate>
  );
}

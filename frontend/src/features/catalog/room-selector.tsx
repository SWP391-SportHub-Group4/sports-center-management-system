"use client";
import { Field, AsyncSection } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import { catalogApi } from "./api";
export function RoomSelector({
  value,
  onChange,
  sportId,
}: {
  value: string;
  onChange: (value: string) => void;
  sportId?: number;
}) {
  const { t } = useLanguage();
  const data = useApi(
    async (signal) => {
      const [rooms, types] = await Promise.all([
        catalogApi.rooms(signal),
        catalogApi.roomTypes(signal),
      ]);
      return rooms.filter(
        (r) =>
          r.isActive &&
          (!sportId ||
            types
              .find((rt) => rt.roomTypeId === r.roomTypeId)
              ?.sportIds.includes(sportId)),
      );
    },
    [sportId],
  );
  return (
    <AsyncSection state={data}>
      {(rooms) => (
        <Field label={t.operations.room}>
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
  );
}

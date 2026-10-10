"use client";

import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import type { InvoiceItemDto, ManagerCourseDto, RoomDto } from "@/lib/types";

// Older checkout records embed room/class keys in their description. Resolve those
// specific entity references while retaining the original invoice quantities.
export function useInvoiceItemLabels(items: InvoiceItemDto[]) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const manager = user?.role === "CenterManager";
  const keys = items
    .map((item) => `${item.itemId}:${item.classId}:${item.description}`)
    .join("|");
  const state = useApi(
    async (signal) => {
      if (!manager || !items.length)
        return {
          rooms: [] as RoomDto[],
          courses: {} as Record<number, string>,
        };
      const rentals = items.some(
        (item) =>
          item.itemType === "RENTAL" &&
          /^Thuê sân #\d+, môn #\d+, \d+ giờ$/.test(item.description),
      );
      const classIds = [
        ...new Set(
          items.flatMap((item) => (item.classId == null ? [] : [item.classId])),
        ),
      ];
      const [rooms, courses] = await Promise.all([
        rentals
          ? api.get<RoomDto[]>("/api/rooms", { signal })
          : Promise.resolve([]),
        Promise.all(
          classIds.map(async (id) => {
            try {
              const course = await api.get<ManagerCourseDto>(
                `/api/manager/classes/${id}`,
                { signal },
              );
              return [id, course.name] as const;
            } catch {
              return [id, t.managerAudit.nameUnavailable] as const;
            }
          }),
        ),
      ]);
      return { rooms, courses: Object.fromEntries(courses) };
    },
    [keys, manager, t.managerAudit.nameUnavailable],
  );
  return (item: InvoiceItemDto) => {
    if (!manager) return item.description;
    const rental =
      item.itemType === "RENTAL"
        ? item.description.match(/^Thuê sân #(\d+), môn #\d+, (\d+) giờ$/)
        : null;
    if (rental) {
      const room = state.data?.rooms.find(
        (room) => room.roomId === Number(rental[1]),
      );
      return `${t.operations.rental} · ${room?.name ?? (state.loading ? t.common.loading : t.managerAudit.nameUnavailable)}${item.sportName ? ` · ${item.sportName}` : ""} · ${rental[2]} ${t.operations.hours.toLowerCase()}`;
    }
    if (item.classId != null && /#\d+/.test(item.description))
      return (
        state.data?.courses[item.classId] ??
        (state.loading ? t.common.loading : t.managerAudit.nameUnavailable)
      );
    return item.description;
  };
}

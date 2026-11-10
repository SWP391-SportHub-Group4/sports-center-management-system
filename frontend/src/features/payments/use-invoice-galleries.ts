"use client";

import { useServiceGalleries } from "@/features/service-media";
import type { InvoiceItemDto } from "@/lib/types";

export function useInvoiceGalleries(items: readonly InvoiceItemDto[]) {
  const classes = useServiceGalleries(
    "class",
    items.flatMap((item) => (item.classId ? [item.classId] : [])),
  );
  const memberships = useServiceGalleries(
    "membership",
    items.flatMap((item) =>
      item.serviceImageKind === "membership" && item.serviceImageId
        ? [item.serviceImageId]
        : [],
    ),
  );
  const rooms = useServiceGalleries(
    "room",
    items.flatMap((item) =>
      item.serviceImageKind === "room" && item.serviceImageId
        ? [item.serviceImageId]
        : [],
    ),
  );
  return (item: InvoiceItemDto) =>
    item.classId
      ? classes.galleries.get(item.classId)
      : item.serviceImageKind === "membership" && item.serviceImageId
        ? memberships.galleries.get(item.serviceImageId)
        : item.serviceImageKind === "room" && item.serviceImageId
          ? rooms.galleries.get(item.serviceImageId)
          : undefined;
}

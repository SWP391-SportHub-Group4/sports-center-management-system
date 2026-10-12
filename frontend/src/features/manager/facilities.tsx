"use client";
import { useUrlQuery, choiceQuery } from "@/lib/useUrlQuery";
import { RoomsManager } from "@/features/catalog";
import { RoomTypesManager } from "@/features/catalog";
export function Facilities() {
  const { values } = useUrlQuery(
    { tab: "rooms" },
    { tab: choiceQuery(["rooms", "types"], "rooms") },
  );
  return values.tab === "rooms" ? <RoomsManager /> : <RoomTypesManager />;
}

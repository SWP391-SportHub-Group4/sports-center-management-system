"use client";
import { OperationsPage } from "@/features/operations/ui";
import { RoomTypesManager } from "@/features/catalog/room-types-manager";
export default function Page() {
  return (
    <OperationsPage title="roomTypes">
      <RoomTypesManager />
    </OperationsPage>
  );
}

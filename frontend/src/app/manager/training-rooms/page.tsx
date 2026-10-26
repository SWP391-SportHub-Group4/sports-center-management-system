"use client";
import { OperationsPage } from "@/features/operations/ui";
import { RoomsManager } from "@/features/catalog/rooms-manager";
export default function Page() {
  return (
    <OperationsPage title="room">
      <RoomsManager />
    </OperationsPage>
  );
}

"use client";
import { OperationsPage } from "@/features/operations/ui";
import { ManagerSchedule } from "@/features/manager/manager-schedule";
export default function Page() {
  return (
    <OperationsPage title="courtSchedule">
      <ManagerSchedule />
    </OperationsPage>
  );
}

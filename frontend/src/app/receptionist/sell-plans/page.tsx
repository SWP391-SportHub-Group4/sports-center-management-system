"use client";
import { OperationsPage } from "@/features/operations/ui";
import { MemberDesk } from "@/features/receptionist/front-desk";
export default function Page() {
  return (
    <OperationsPage title="sellPlans" roles={["Receptionist"]}>
      <MemberDesk mode="sales" />
    </OperationsPage>
  );
}

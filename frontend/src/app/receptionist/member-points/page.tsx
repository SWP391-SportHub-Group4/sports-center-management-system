"use client";
import { OperationsPage } from "@/features/operations/ui";
import { MemberDesk } from "@/features/receptionist/front-desk";
export default function Page() {
  return (
    <OperationsPage title="wallet" roles={["Receptionist"]}>
      <MemberDesk mode="wallet" />
    </OperationsPage>
  );
}

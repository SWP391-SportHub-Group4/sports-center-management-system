"use client";
import { OperationsPage } from "@/features/operations/ui";
import { MembershipManager } from "@/features/catalog/membership-manager";
export default function Page() {
  return (
    <OperationsPage title="gym">
      <MembershipManager />
    </OperationsPage>
  );
}

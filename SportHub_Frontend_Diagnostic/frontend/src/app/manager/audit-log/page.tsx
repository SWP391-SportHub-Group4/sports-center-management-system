"use client";
import { StaffPage } from "@/features/coaching/ui";
import { AuditLogView } from "@/components/AuditLogView";
export default function Page() {
  return (
    <StaffPage title="audit" manager>
      <AuditLogView />
    </StaffPage>
  );
}

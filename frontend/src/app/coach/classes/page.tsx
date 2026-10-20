"use client";

import { StaffPage } from "@/features/coaching/ui";
import { CoachWorkspace } from "@/features/coaching/coach-workspace";

export default function CoachClassesPage() {
  return (
    <StaffPage title="classes">
      <CoachWorkspace mode="classes" />
    </StaffPage>
  );
}

"use client";

import { OperationsPage } from "@/features/operations";
import { CourtCalendar } from "@/features/court-schedule/court-calendar";
import { useLanguage } from "@/lib/language";
import { CoachWorkspaceRoute } from "@/features/pt/coach-workspace-route";
export default function CoachSchedulePage() {
  const { t } = useLanguage();
  return (
    <CoachWorkspaceRoute
      mode="schedule"
      pt={
        <OperationsPage title="teachingSchedule" roles={["Coach"]}>
          <p>{t.staffWork.readOnly}</p>
          <CourtCalendar includeCoachPt />
        </OperationsPage>
      }
    />
  );
}

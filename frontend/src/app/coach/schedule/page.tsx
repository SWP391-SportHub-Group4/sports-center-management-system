"use client";

import { PtPage } from "@/features/pt/ui";
import { CoachPtSchedule } from "@/features/pt/pt-sessions";
import { useLanguage } from "@/lib/language";
import { CoachWorkspaceRoute } from "@/features/pt/coach-workspace-route";
export default function CoachSchedulePage() {
  const { t } = useLanguage();
  return (
    <CoachWorkspaceRoute
      mode="schedule"
      pt={
        <PtPage
          title="sessions"
          titleText={t.navigation.items.teachingSchedule}
        >
          <CoachPtSchedule />
        </PtPage>
      }
    />
  );
}

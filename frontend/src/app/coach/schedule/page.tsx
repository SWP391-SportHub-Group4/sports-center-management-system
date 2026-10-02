"use client";

import { OperationsPage } from "@/features/operations";
import { CourtCalendar } from "@/features/court-schedule/court-calendar";
import { AsyncSection } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/apiClient";
import type { SportDto } from "@/lib/types";

function TeachingCalendar() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { signal }),
    [],
  );
  return (
    <>
      <p>{t.operations.readOnly}</p>
      <AsyncSection state={sports}>
        {(rows) => (
          <CourtCalendar
            includeCoachPt={rows.some(
              (sport) =>
                sport.operationType === "ONE_ON_ONE" &&
                user?.sportIds.includes(sport.sportId),
            )}
          />
        )}
      </AsyncSection>
    </>
  );
}

export default function CoachSchedulePage() {
  return (
    <OperationsPage title="teachingSchedule" roles={["Coach"]}>
      <TeachingCalendar />
    </OperationsPage>
  );
}

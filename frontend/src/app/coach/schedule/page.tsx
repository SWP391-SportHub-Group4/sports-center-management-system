"use client";

import { OperationsPage } from "@/features/operations";
import { CourtCalendar } from "@/features/court-schedule/court-calendar";
import { useLanguage } from "@/lib/language";
export default function CoachSchedulePage() { const { t } = useLanguage(); return <OperationsPage title="teachingSchedule" roles={["Coach"]}><p>{t.staffWork.readOnly}</p><CourtCalendar includeCoachPt/></OperationsPage>; }

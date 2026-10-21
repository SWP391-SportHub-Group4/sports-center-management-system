"use client";

import { AppShell } from "@/components/AppShell";
import { CoachChangeRequests } from "@/features/coaching/coach-change-requests";
import { useLanguage } from "@/lib/language";

export default function CoachChangeRequestsPage() {
  const { language } = useLanguage();
  const vi = language === "vi";
  return (
    <AppShell
      title={vi ? "Yêu cầu đổi lịch" : "Change requests"}
      allow={["Coach"]}
    >
      <CoachChangeRequests />
    </AppShell>
  );
}

"use client";

import { AppShell } from "@/components/AppShell";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { CoachRequestCenter } from "@/features/coaching/coach-request-center";

export default function CoachSupportPage() {
  return (
    <AppShell title="Requests" allow={["Coach"]}>
      <Suspense fallback={<Loading />}>
        <CoachRequestCenter />
      </Suspense>
    </AppShell>
  );
}

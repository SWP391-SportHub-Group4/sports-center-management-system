"use client";

import { PtPage } from "@/features/pt/ui";
import { CoachWorkspace } from "@/features/pt/coach-workspace";

export default function CoachClassesPage() {
  return (
    <PtPage title="classes">
      <CoachWorkspace mode="classes" />
    </PtPage>
  );
}

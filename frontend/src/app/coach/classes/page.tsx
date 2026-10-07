"use client";

import { PtPage } from "@/features/pt/ui";
import { CoachClasses } from "@/features/pt/coach-classes";

export default function CoachClassesPage() {
  return (
    <PtPage title="classes">
      <CoachClasses />
    </PtPage>
  );
}
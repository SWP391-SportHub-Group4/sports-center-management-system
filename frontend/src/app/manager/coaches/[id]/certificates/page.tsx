"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CoachDetail } from "@/features/coaches/coach-detail";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell title="Certificate" allow={["CenterManager"]} operationalLayout>
      <CoachDetail userId={id} certificatePage />
    </AppShell>
  );
}

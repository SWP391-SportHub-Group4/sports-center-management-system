"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { UnifiedAttendanceBoard } from "@/components/UnifiedAttendanceBoard";
import { Loading } from "@/components/ui";
import { useLanguage } from "@/lib/language";

function Board() {
  const params = useSearchParams();
  return (
    <UnifiedAttendanceBoard
      initialDate={params.get("date")}
      initialSessionId={params.get("session")}
    />
  );
}

export default function Page() {
  const { t } = useLanguage();
  return (
    <AppShell title={t.operations.attendance} allow={["Receptionist"]}>
      <Suspense fallback={<Loading />}>
        <Board />
      </Suspense>
    </AppShell>
  );
}

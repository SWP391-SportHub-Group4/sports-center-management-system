"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AttendanceBoard } from "@/components/AttendanceBoard";
import { Loading } from "@/components/ui";
import { useLanguage } from "@/lib/language";

function Board() {
  const params = useSearchParams();
  return (
    <AttendanceBoard
      coachOnly={false}
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

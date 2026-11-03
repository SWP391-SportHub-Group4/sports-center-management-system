"use client";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { Loading } from "@/components/ui";
import { ManagerPeople } from "@/features/manager/manager-people";
export default function Page() {
  return (
    <AppShell title="People" allow={["CenterManager"]} operationalLayout>
      <Suspense fallback={<Loading />}>
        <ManagerPeople />
      </Suspense>
    </AppShell>
  );
}

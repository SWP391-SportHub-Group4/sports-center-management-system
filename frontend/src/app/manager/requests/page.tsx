"use client";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { Loading } from "@/components/ui";
import { RequestCenter } from "@/features/manager/request-center";
export default function Page() {
  return (
    <AppShell title="Request" allow={["CenterManager"]} operationalLayout>
      <Suspense fallback={<Loading />}>
        <RequestCenter />
      </Suspense>
    </AppShell>
  );
}

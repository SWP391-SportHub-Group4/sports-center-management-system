"use client";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Loading } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { ManagerMemberProfile } from "@/features/pt/manager-members";

export default function Page() {
  const { t } = useLanguage();
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell title={t.ptOps.members} allow={["CenterManager"]}>
      <Suspense fallback={<Loading />}>
        <ManagerMemberProfile memberId={id} />
      </Suspense>
    </AppShell>
  );
}

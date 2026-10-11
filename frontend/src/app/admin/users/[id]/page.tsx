"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { UserDetail } from "@/features/administration/user-detail";
import { useLanguage } from "@/lib/language";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  return (
    <AppShell
      title={t.adminWork.detailTitle}
      allow={["SystemAdministrator"]}
      operationalLayout
    >
      <UserDetail key={id} userId={id} />
    </AppShell>
  );
}

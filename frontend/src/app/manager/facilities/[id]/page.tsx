"use client";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useLanguage } from "@/lib/language";
import { RoomsManager } from "@/features/catalog/rooms-manager";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  return (
    <AppShell
      title={t.managerOperations.facilities}
      allow={["CenterManager"]}
      operationalLayout
    >
      <div className="stack">
        <RoomsManager detailId={Number(id)} />
      </div>
    </AppShell>
  );
}

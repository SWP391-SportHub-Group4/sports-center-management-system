"use client";
import { OperationsPage } from "@/features/operations/ui";
import { SettingsManager } from "@/features/catalog/settings-manager";
export default function Page() {
  return (
    <OperationsPage title="settings">
      <SettingsManager />
    </OperationsPage>
  );
}

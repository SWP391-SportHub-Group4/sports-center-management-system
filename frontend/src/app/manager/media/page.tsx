"use client";
import { AppShell } from "@/components/AppShell";
import { MediaEditor } from "@/features/manager/media-editor";

export default function Page() {
  return (
    <AppShell
      title="Media"
      description="Manage homepage copy, images and frequently asked questions."
      allow={["CenterManager"]}
      operationalLayout
    >
      <MediaEditor />
    </AppShell>
  );
}

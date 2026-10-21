"use client";
import { AppShell } from "@/components/AppShell";
import { MediaEditor } from "@/features/manager/media-editor";

export default function Page() {
  return (
    <AppShell
      title="Media"
      description="Update images directly in a simplified preview of your homepage."
      allow={["CenterManager"]}
      operationalLayout
    >
      <MediaEditor />
    </AppShell>
  );
}

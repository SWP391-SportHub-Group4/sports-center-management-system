"use client";
import { AppShell } from "@/components/AppShell";
import { LandingPageEditor } from "@/features/manager/landing-page-editor";

export default function Page() {
  return (
    <AppShell
      title="Landing page"
      description="Edit the content and images visitors see on the homepage."
      allow={["CenterManager"]}
      operationalLayout
    >
      <LandingPageEditor />
    </AppShell>
  );
}

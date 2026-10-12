"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { canUsePtFeatures } from "@/lib/permissions";
import { PtPage } from "@/features/pt/ui";
import { CoachOverview } from "@/features/pt/coach-classes";
import { CoachWorkspaceRoute } from "@/features/pt/coach-workspace-route";
export default function Page() {
  const { user } = useAuth();
  const router = useRouter();
  const groupCoach = user?.role === "Coach" && !canUsePtFeatures(user);
  useEffect(() => {
    if (groupCoach) router.replace("/coach/schedule");
  }, [groupCoach, router]);
  if (!user || groupCoach) return null;
  return (
    <CoachWorkspaceRoute
      mode="schedule"
      pt={
        <PtPage title="overview">
          <CoachOverview />
        </PtPage>
      }
    />
  );
}

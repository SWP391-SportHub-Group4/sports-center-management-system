"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { canUsePtFeatures } from "@/lib/permissions";
import { useLanguage } from "@/lib/language";
import { PtPage } from "./ui";
import { CoachWorkspace, type WorkspaceMode } from "./coach-workspace";

export function CoachWorkspaceRoute({
  mode,
  pt,
  initialClassId,
}: {
  mode: WorkspaceMode;
  pt: ReactNode;
  initialClassId?: number;
}) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const labels =
    language === "vi"
      ? { schedule: "Lịch dạy", classes: "Lớp phụ trách", students: "Học viên" }
      : {
          schedule: "Teaching schedule",
          classes: "Assigned classes",
          students: "Students",
        };
  if (canUsePtFeatures(user)) return <>{pt}</>;
  return (
    <PtPage
      title={
        mode === "schedule"
          ? "overview"
          : mode === "classes"
            ? "classes"
            : "members"
      }
      titleText={labels[mode]}
    >
      <CoachWorkspace mode={mode} initialClassId={initialClassId} />
    </PtPage>
  );
}

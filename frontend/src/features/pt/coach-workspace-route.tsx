"use client";

import { useLanguage } from "@/lib/language";
import { PtPage } from "./ui";
import { CoachWorkspace, type WorkspaceMode } from "./coach-workspace";
import { CoachStudentDirectory } from "./coach-students";

export function CoachWorkspaceRoute({
  mode,
  initialClassId,
}: {
  mode: WorkspaceMode;
  initialClassId?: number;
}) {
  const { language } = useLanguage();
  const labels =
    language === "vi"
      ? { schedule: "Lịch dạy", classes: "Lớp học", students: "Học viên" }
      : {
          schedule: "Teaching schedule",
          classes: "Classes",
          students: "Students",
        };
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
      {mode === "students" ? (
        <CoachStudentDirectory />
      ) : (
        <CoachWorkspace mode={mode} initialClassId={initialClassId} />
      )}
    </PtPage>
  );
}

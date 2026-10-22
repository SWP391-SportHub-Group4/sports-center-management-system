"use client";

import { useLanguage } from "@/lib/language";
import { StaffPage } from "./ui";
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
          schedule: "Schedule",
          classes: "Classes",
          students: "Students",
        };
  return (
    <StaffPage
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
    </StaffPage>
  );
}

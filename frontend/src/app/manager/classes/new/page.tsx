"use client";
import { OperationsPage } from "@/features/operations/ui";
import { CourseEditorPage } from "@/features/courses/course-editor-page";
export default function Page() {
  return (
    <OperationsPage title="courses">
      <CourseEditorPage />
    </OperationsPage>
  );
}

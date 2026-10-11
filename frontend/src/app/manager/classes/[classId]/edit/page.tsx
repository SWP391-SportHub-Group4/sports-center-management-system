"use client";
import { useParams } from "next/navigation";
import { OperationsPage } from "@/features/operations/ui";
import { CourseEditorPage } from "@/features/courses/course-editor-page";
export default function Page() {
  const { classId } = useParams<{ classId: string }>();
  return (
    <OperationsPage title="courses">
      <CourseEditorPage classId={Number(classId)} />
    </OperationsPage>
  );
}

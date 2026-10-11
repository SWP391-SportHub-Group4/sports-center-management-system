"use client";
import { useParams } from "next/navigation";
import { OperationsPage } from "@/features/operations/ui";
import { ManagerCourseDetail } from "@/features/courses/manager-courses";
export default function Page() {
  const { classId } = useParams<{ classId: string }>();
  return (
    <OperationsPage title="courses">
      <ManagerCourseDetail classId={Number(classId)} />
    </OperationsPage>
  );
}

"use client";
import { OperationsPage } from "@/features/operations/ui";
import { ManagerCourses } from "@/features/courses/manager-courses";
export default function Page() {
  return (
    <OperationsPage title="courses">
      <ManagerCourses />
    </OperationsPage>
  );
}

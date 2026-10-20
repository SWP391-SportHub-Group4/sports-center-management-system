"use client";
import { OperationsPage } from "@/features/operations/ui";
import { ManagerCourseInterests } from "@/features/courses/manager-course-interests";

export default function Page() {
  return (
    <OperationsPage title="courses" heading="interests">
      <ManagerCourseInterests />
    </OperationsPage>
  );
}

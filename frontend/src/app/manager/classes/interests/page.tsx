"use client";
import { OperationsPage } from "@/features/operations/ui";
import { CourseInterests } from "@/features/courses";

export default function Page() {
  return (
    <OperationsPage title="courses">
      <CourseInterests manager />
    </OperationsPage>
  );
}

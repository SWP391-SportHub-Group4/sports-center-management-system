"use client";
import { useParams } from "next/navigation";
import { CourseDetail } from "@/features/courses/catalog";
import { PublicHeader } from "../../public-header";
export default function Page() {
  const { classId } = useParams<{ classId: string }>();
  return (
    <>
      <PublicHeader />
      <main className="refactor-public">
        <CourseDetail key={classId} classId={Number(classId)} />
      </main>
    </>
  );
}

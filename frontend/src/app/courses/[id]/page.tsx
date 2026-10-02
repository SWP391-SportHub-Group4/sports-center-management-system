"use client";
import { useParams } from "next/navigation";
import { CourseDetail } from "@/features/courses/catalog";
import { PublicHeader } from "../../public-header";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <PublicHeader />
      <main className="refactor-public">
        <CourseDetail key={id} classId={Number(id)} />
      </main>
    </>
  );
}

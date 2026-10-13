"use client";
import { useParams } from "next/navigation";
import { CoachWorkspaceRoute } from "@/features/pt/coach-workspace-route";

export default function Page() {
  const { classId } = useParams<{ classId: string }>();

  return (
    <CoachWorkspaceRoute mode="classes" initialClassId={Number(classId)} />
  );
}

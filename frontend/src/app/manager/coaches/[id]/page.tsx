"use client";
import { useParams } from "next/navigation";
import { OperationsPage } from "@/features/operations/ui";
import { CoachDetail } from "@/features/coaches/coach-detail";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <OperationsPage title="coaches">
      <CoachDetail userId={id} />
    </OperationsPage>
  );
}

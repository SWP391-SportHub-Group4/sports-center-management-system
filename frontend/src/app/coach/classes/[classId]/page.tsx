"use client";
import { useParams } from "next/navigation";
import { PtPage } from "@/features/pt/ui";
import { CoachClassDetail } from "@/features/pt/coach-classes";
export default function Page() { const { classId } = useParams<{ classId: string }>(); return <PtPage title="classes"><CoachClassDetail key={classId} classId={Number(classId)}/></PtPage>; }

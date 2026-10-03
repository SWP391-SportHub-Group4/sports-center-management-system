"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PtPage, Specialty } from "@/features/pt/ui";
import { CoachProgress } from "@/features/pt/workout-result-form";
import { useLanguage } from "@/lib/language";
function Content() { const sessionId = useSearchParams().get("sessionId") ?? ""; const { t } = useLanguage(); return <Specialty>{hasPt => hasPt ? <CoachProgress key={sessionId} initialSessionId={sessionId}/> : <p role="alert">{t.staffWork.specialtyWarning}</p>}</Specialty>; }
export default function Page() { return <PtPage title="results"><Suspense><Content/></Suspense></PtPage>; }

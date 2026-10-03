"use client";
import { PtPage, Specialty } from "@/features/pt/ui";
import { CoachHomework } from "@/features/pt/homework-editor";
import { useLanguage } from "@/lib/language";
export default function Page() { const { t } = useLanguage();return <PtPage title="homework"><Specialty>{hasPt => hasPt ? <CoachHomework/> : <p role="alert">{t.staffWork.specialtyWarning}</p>}</Specialty></PtPage>; }

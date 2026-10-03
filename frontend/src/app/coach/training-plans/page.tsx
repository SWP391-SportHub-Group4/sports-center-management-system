"use client";
import { PtPage, Specialty } from "@/features/pt/ui";
import { TrainingPlans } from "@/features/pt/training-plans";
import { useLanguage } from "@/lib/language";
export default function Page() { const { t } = useLanguage();return <PtPage title="plans"><Specialty>{hasPt => hasPt ? <TrainingPlans/> : <p role="alert">{t.staffWork.specialtyWarning}</p>}</Specialty></PtPage>; }

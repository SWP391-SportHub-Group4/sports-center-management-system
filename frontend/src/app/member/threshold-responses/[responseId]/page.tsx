"use client";
import { useParams } from "next/navigation";
import { ThresholdPanel } from "@/features/courses/threshold";
import { MemberShell } from "@/components/MemberShell";
import { useLanguage } from "@/lib/language";
export default function Page() {
  const { responseId } = useParams<{ responseId: string }>();
  const { t } = useLanguage();
  return (
    <MemberShell title={t.refactor.threshold}>
      <ThresholdPanel key={responseId} responseId={responseId} />
    </MemberShell>
  );
}

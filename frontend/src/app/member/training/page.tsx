"use client";
import { MemberShell } from "@/components/MemberShell";
import { MemberTrainingLite } from "@/features/training/member-training-lite";
import { useLanguage } from "@/lib/language";
export default function Page() {
  const { t } = useLanguage();
  return (
    <MemberShell title={t.refactor.training}>
      <MemberTrainingLite />
    </MemberShell>
  );
}

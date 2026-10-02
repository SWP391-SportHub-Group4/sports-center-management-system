"use client";
import { MemberShell } from "@/components/MemberShell";
import { MemberTraining } from "@/features/training/member-training";
import { useLanguage } from "@/lib/language";
export default function Page() {
  const { t } = useLanguage();
  return (
    <MemberShell title={t.refactor.training}>
      <MemberTraining />
    </MemberShell>
  );
}

"use client";
import { MemberShell } from "@/components/MemberShell";
import { MemberSchedule } from "@/features/member/schedule";
import { useLanguage } from "@/lib/language";
export default function Page() {
  const { t } = useLanguage();
  return (
    <MemberShell
      title={t.memberPages.schedule}
      description={t.mSchedule.description}
    >
      <MemberSchedule />
    </MemberShell>
  );
}

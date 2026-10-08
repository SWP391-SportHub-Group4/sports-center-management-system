"use client";
import { MemberShell } from "@/components/MemberShell";
import { MemberCourses } from "@/features/member/courses";
import { useLanguage } from "@/lib/language";
export default function Page() {
  const { t } = useLanguage();
  return (
    <MemberShell
      title={t.memberPages.courses}
      description={t.mCourses.description}
    >
      <MemberCourses />
    </MemberShell>
  );
}

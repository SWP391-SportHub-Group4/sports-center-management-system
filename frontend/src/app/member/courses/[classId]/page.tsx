"use client";
import { use } from "react";
import { MemberShell } from "@/components/MemberShell";
import { MemberCourseDetail } from "@/features/member/courses";
import { useLanguage } from "@/lib/language";
export default function Page({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = use(params);
  const { t } = useLanguage();
  return (
    <MemberShell title={t.memberPages.courses}>
      <MemberCourseDetail classId={Number(classId)} />
    </MemberShell>
  );
}
